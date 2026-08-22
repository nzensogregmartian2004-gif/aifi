import { prisma } from "../../db/client";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";
import { giveChange, generateDisbursementReference } from "../payments/mypvit.client";

export async function getAvailableCeiling(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const activeRequests = await prisma.aidRequest.findMany({
    where: {
      userId,
      status: { in: ["ACCEPTED", "DISBURSED", "LATE"] },
    },
    include: { repayments: true },
  });

  const totalUsed = activeRequests.reduce((sum: number, r: typeof activeRequests[number]) => {
    const repaid = r.repayments.reduce((s: number, rep: typeof r.repayments[number]) => s + rep.amount, 0);
    return sum + (r.amount - repaid);
  }, 0);

  return user.ceiling - totalUsed;
}

export async function requestAid(
  userId: string,
  amount: number,
  receivingOperator: "AIRTEL_MONEY" | "MOOV_MONEY",
  receivingPhone: string,
  receivingName: string
) {
  if (!amount || amount <= 0) {
    throw new Error("Le montant demandé doit être positif");
  }
  if (!receivingOperator || !receivingPhone || !receivingName) {
    throw new Error("L'opérateur, le numéro et le nom du compte de réception sont obligatoires.");
  }

  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.status !== "ACTIVE") {
    throw new Error("Ton compte doit d'abord être validé par un administrateur avant de pouvoir demander une aide.");
  }

  const available = await getAvailableCeiling(userId);
  if (amount > available) {
    throw new Error(`Montant demandé (${amount}) dépasse le plafond disponible (${available})`);
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  // Le taux ET la durée sont figés à la date de la demande : les modifier
  // plus tard dans les paramètres n'affecte jamais les demandes déjà créées
  // — le client garde exactement ce qu'il a vu et accepté au moment de sa
  // demande.
  const amountDue = Math.round(amount * (1 + settings.serviceFeePercent / 100));
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + settings.defaultDurationDays);

  const request = await prisma.aidRequest.create({
    data: {
      userId,
      amount,
      amountDue,
      dueDate,
      receivingOperator,
      receivingPhone,
      receivingName,
      status: "PENDING",
    },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins(
    "aid_request_created",
    `${user.name} a demandé une aide de ${amount} FCFA.`,
    request.id
  );

  return request;
}

export async function acceptAidRequest(id: string, adminId: string) {
  // La durée et la date d'échéance sont déjà figées depuis la création de la
  // demande (voir requestAid) — accepter ne fait plus que changer le statut.
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "PENDING") {
    throw new Error(`Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
  }

  const request = await prisma.aidRequest.update({
    where: { id },
    data: { status: "ACCEPTED" },
  });

  await logAction({
    adminId,
    action: "aid_request_accept",
    entityType: "AidRequest",
    entityId: id,
    before: { status: existing.status },
    after: { status: request.status },
  });

  await notifyUser(
    request.userId,
    "aid_request_accepted",
    `Votre demande de ${request.amount} FCFA a été acceptée. Remboursement attendu avant le ${request.dueDate?.toLocaleDateString("fr-FR")}.`,
    request.id
  );

  return request;
}

export async function rejectAidRequest(id: string, adminId: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "PENDING") {
    throw new Error(`Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
  }

  const request = await prisma.aidRequest.update({ where: { id }, data: { status: "REJECTED" } });

  await logAction({
    adminId,
    action: "aid_request_reject",
    entityType: "AidRequest",
    entityId: id,
    before: { status: existing.status },
    after: { status: request.status },
  });

  await notifyUser(
    request.userId,
    "aid_request_rejected",
    `Votre demande de ${request.amount} FCFA a été refusée.`,
    request.id
  );

  return request;
}

export async function disburseAidRequest(id: string, adminId: string, note?: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "ACCEPTED") {
    throw new Error(`Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
  }

  const request = await prisma.aidRequest.update({ where: { id }, data: { status: "DISBURSED" } });

  await logAction({
    adminId,
    action: "aid_request_disburse_manual",
    entityType: "AidRequest",
    entityId: id,
    before: { status: existing.status },
    after: { status: request.status },
    note,
  });

  await notifyUser(
    request.userId,
    "aid_request_disbursed",
    `Les fonds de votre demande de ${request.amount} FCFA ont été envoyés.`,
    request.id
  );

  return request;
}

/**
 * Décaissement automatique via MyPVit (GIVE_CHANGE, synchrone : le statut
 * final est dans la réponse, pas besoin d'attendre un webhook). Envoie
 * toujours vers l'opérateur et le numéro choisis par le CLIENT lui-même à sa
 * demande (jamais un choix de l'admin). En cas d'échec, la demande reste
 * "ACCEPTED" — l'admin peut réessayer ou basculer sur l'envoi manuel
 * (disburseAidRequest ci-dessus).
 */
export async function disburseAidRequestViaMypvit(id: string, adminId: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
  if (existing.status !== "ACCEPTED") {
    throw new Error(`Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
  }
  if (!existing.receivingOperator || !existing.receivingPhone) {
    throw new Error("Cette demande n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
  }

  const reference = generateDisbursementReference();

  const transaction = await prisma.paymentTransaction.create({
    data: {
      reference,
      userId: existing.userId,
      aidRequestId: existing.id,
      amount: existing.amount,
      operator: existing.receivingOperator,
      status: "PENDING",
    },
  });

  let result;
  try {
    result = await giveChange({
      amount: existing.amount,
      phone: existing.receivingPhone,
      reference,
      operatorCode: existing.receivingOperator as "AIRTEL_MONEY" | "MOOV_MONEY",
      freeInfo: `Décaissement aide AIFI ${existing.id}`,
    });
  } catch (err: any) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", rawInitResponse: { error: err.message } },
    });
    throw new Error(`Le décaissement automatique a échoué : ${err.message}`);
  }

  const success = result.status === "SUCCESS";
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: { status: success ? "SUCCESS" : "FAILED", providerTransactionId: result.reference_id, rawInitResponse: result as any },
  });

  if (!success) {
    throw new Error(result.message || "Le décaissement a été refusé par l'opérateur.");
  }

  const request = await prisma.aidRequest.update({ where: { id }, data: { status: "DISBURSED" } });

  await logAction({
    adminId,
    action: "aid_request_disburse_auto",
    entityType: "AidRequest",
    entityId: id,
    before: { status: existing.status },
    after: { status: request.status, reference, operator: existing.receivingOperator },
  });

  await notifyUser(
    request.userId,
    "aid_request_disbursed",
    `Les fonds de votre demande de ${request.amount} FCFA ont été envoyés automatiquement sur ton compte ${existing.receivingOperator === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money"}.`,
    request.id
  );

  return request;
}

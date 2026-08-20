import { prisma } from "../../db/client";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";
import { giveChange, generateDisbursementReference, detectOperator } from "../payments/mypvit.client";

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

export async function requestAid(userId: string, amount: number) {
  if (!amount || amount <= 0) {
    throw new Error("Le montant demandé doit être positif");
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
  // Le taux est figé à la date de la demande : le modifier plus tard dans les
  // paramètres n'affecte jamais les demandes déjà créées.
  const amountDue = Math.round(amount * (1 + settings.serviceFeePercent / 100));

  const request = await prisma.aidRequest.create({
    data: { userId, amount, amountDue, status: "PENDING" },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins(
    "aid_request_created",
    `${user.name} a demandé une aide de ${amount} FCFA.`,
    request.id
  );

  return request;
}

export async function acceptAidRequest(id: string, durationDays: number, adminId: string) {
  const allowed = await prisma.allowedDuration.findUnique({ where: { days: durationDays } });
  if (!allowed) {
    throw new Error(`Durée ${durationDays} jours non autorisée`);
  }

  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "PENDING") {
    throw new Error(`Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + durationDays);

  const request = await prisma.aidRequest.update({
    where: { id },
    data: { status: "ACCEPTED", dueDate },
  });

  await logAction({
    adminId,
    action: "aid_request_accept",
    entityType: "AidRequest",
    entityId: id,
    before: { status: existing.status },
    after: { status: request.status, dueDate: request.dueDate, durationDays },
  });

  await notifyUser(
    request.userId,
    "aid_request_accepted",
    `Votre demande de ${request.amount} FCFA a été acceptée. Remboursement attendu avant le ${dueDate.toLocaleDateString("fr-FR")}.`,
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

export async function disburseAidRequest(id: string, adminId: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "ACCEPTED") {
    throw new Error(`Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
  }

  const request = await prisma.aidRequest.update({ where: { id }, data: { status: "DISBURSED" } });

  await logAction({
    adminId,
    action: "aid_request_disburse",
    entityType: "AidRequest",
    entityId: id,
    before: { status: existing.status },
    after: { status: request.status },
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
 * final est dans la réponse, pas besoin d'attendre un webhook). En cas
 * d'échec, la demande reste "ACCEPTED" — l'admin peut réessayer ou basculer
 * sur l'envoi manuel (disburseAidRequest ci-dessus).
 */
export async function disburseAidRequestViaMypvit(
  id: string,
  adminId: string,
  operatorCode: "AIRTEL_MONEY" | "MOOV_MONEY"
) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
  if (existing.status !== "ACCEPTED") {
    throw new Error(`Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
  }

  const reference = generateDisbursementReference();

  const transaction = await prisma.paymentTransaction.create({
    data: {
      reference,
      userId: existing.userId,
      aidRequestId: existing.id,
      amount: existing.amount,
      operator: operatorCode,
      status: "PENDING",
    },
  });

  let result;
  try {
    result = await giveChange({
      amount: existing.amount,
      phone: existing.user.phone,
      reference,
      operatorCode,
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
    after: { status: request.status, reference, operator: operatorCode },
  });

  await notifyUser(
    request.userId,
    "aid_request_disbursed",
    `Les fonds de votre demande de ${request.amount} FCFA ont été envoyés automatiquement sur ton compte ${operatorCode === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money"}.`,
    request.id
  );

  return request;
}

/** Suggestion d'opérateur basée sur le numéro du client — l'admin peut la corriger. */
export async function suggestDisbursementOperator(id: string): Promise<"AIRTEL_MONEY" | "MOOV_MONEY" | null> {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
  return detectOperator(existing.user.phone);
}

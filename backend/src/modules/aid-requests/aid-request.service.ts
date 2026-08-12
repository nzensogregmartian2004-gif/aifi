import { prisma } from "../../db/client";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";

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

  const available = await getAvailableCeiling(userId);
  if (amount > available) {
    throw new Error(`Montant demandé (${amount}) dépasse le plafond disponible (${available})`);
  }

  const request = await prisma.aidRequest.create({
    data: { userId, amount, status: "PENDING" },
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

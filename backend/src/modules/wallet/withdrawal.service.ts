import { prisma } from "../../db/client";
import { getWalletBalance } from "./wallet.service";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";

export async function requestWithdrawal(userId: string, amount: number) {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });

  if (amount < settings.minWithdrawal) {
    throw new Error(`Montant minimum de retrait : ${settings.minWithdrawal} FCFA`);
  }

  const balance = await getWalletBalance(userId);
  if (amount > balance) {
    throw new Error(`Solde insuffisant (disponible : ${balance} FCFA)`);
  }

  const withdrawal = await prisma.withdrawal.create({
    data: { userId, amount, status: "PENDING" },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins(
    "withdrawal_requested",
    `${user.name} demande un retrait de ${amount} FCFA de son portefeuille.`
  );

  return withdrawal;
}

/**
 * Approuve un retrait. Re-vérifie le statut ET le solde AU MOMENT de l'approbation
 * (pas seulement au moment de la demande) dans une transaction, pour éviter qu'un
 * portefeuille devienne négatif si deux retraits sont approuvés coup sur coup.
 */
export async function approveWithdrawal(withdrawalId: string, adminId: string, proofImageUrl: string) {
  if (!proofImageUrl) {
    throw new Error("Un justificatif (image) est requis pour approuver un retrait");
  }

  const result = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });

    if (withdrawal.status !== "PENDING") {
      throw new Error(`Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
    }

    const entries = await tx.walletEntry.findMany({ where: { userId: withdrawal.userId } });
    const balance = entries.reduce((sum, e) => sum + e.amount, 0);

    if (withdrawal.amount > balance) {
      throw new Error(
        `Solde insuffisant pour approuver ce retrait (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA). Le solde a dû changer depuis la demande.`
      );
    }

    const updated = await tx.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: "APPROVED", proofImageUrl },
    });

    await tx.walletEntry.create({
      data: { userId: withdrawal.userId, amount: -withdrawal.amount, reason: "withdrawal_approved" },
    });

    return updated;
  });

  await logAction({
    adminId,
    action: "withdrawal_approve",
    entityType: "Withdrawal",
    entityId: withdrawalId,
    before: { status: "PENDING" },
    after: { status: "APPROVED", amount: result.amount },
  });

  await notifyUser(
    result.userId,
    "withdrawal_approved",
    `Votre retrait de ${result.amount} FCFA a été approuvé et envoyé.`
  );

  return result;
}

export async function rejectWithdrawal(withdrawalId: string, adminId: string) {
  const existing = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  if (existing.status !== "PENDING") {
    throw new Error(`Ce retrait a déjà été traité (statut actuel : ${existing.status})`);
  }

  const withdrawal = await prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: { status: "REJECTED" },
  });

  await logAction({
    adminId,
    action: "withdrawal_reject",
    entityType: "Withdrawal",
    entityId: withdrawalId,
    before: { status: "PENDING" },
    after: { status: "REJECTED" },
  });

  await notifyUser(
    withdrawal.userId,
    "withdrawal_rejected",
    `Votre retrait de ${withdrawal.amount} FCFA a été refusé.`
  );

  return withdrawal;
}
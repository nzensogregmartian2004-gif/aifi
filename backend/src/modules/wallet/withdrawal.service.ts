import { prisma } from "../../db/client";
import { getWalletBalance } from "./wallet.service";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";
import { giveChange, generateDisbursementReference } from "../payments/mypvit.client";

export async function requestWithdrawal(
  userId: string,
  amount: number,
  receivingOperator: "AIRTEL_MONEY" | "MOOV_MONEY",
  receivingPhone: string,
  receivingName: string
) {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });

  if (amount < settings.minWithdrawal) {
    throw new Error(`Montant minimum de retrait : ${settings.minWithdrawal} FCFA`);
  }
  if (!receivingOperator || !receivingPhone || !receivingName) {
    throw new Error("L'opérateur, le numéro et le nom du compte de réception sont obligatoires.");
  }

  const balance = await getWalletBalance(userId);
  if (amount > balance) {
    throw new Error(`Solde insuffisant (disponible : ${balance} FCFA)`);
  }

  const withdrawal = await prisma.withdrawal.create({
    data: { userId, amount, receivingOperator, receivingPhone, receivingName, status: "PENDING" },
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

/**
 * Approuve et envoie un retrait automatiquement via MyPVit (GIVE_CHANGE,
 * synchrone). Même logique de re-vérification du solde qu'en approbation
 * manuelle. En cas d'échec, le retrait reste PENDING — l'admin peut réessayer
 * ou basculer sur l'envoi manuel (approveWithdrawal ci-dessus).
 */
export async function approveWithdrawalViaMypvit(withdrawalId: string, adminId: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { user: true } });
  if (withdrawal.status !== "PENDING") {
    throw new Error(`Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
  }
  if (!withdrawal.receivingOperator || !withdrawal.receivingPhone) {
    throw new Error("Ce retrait n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
  }

  const balance = await getWalletBalance(withdrawal.userId);
  if (withdrawal.amount > balance) {
    throw new Error(`Solde insuffisant (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA).`);
  }

  const operatorCode = withdrawal.receivingOperator as "AIRTEL_MONEY" | "MOOV_MONEY";
  const reference = generateDisbursementReference();
  const transaction = await prisma.paymentTransaction.create({
    data: {
      reference,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      operator: operatorCode,
      status: "PENDING",
    },
  });

  let result;
  try {
    result = await giveChange({
      amount: withdrawal.amount,
      phone: withdrawal.receivingPhone,
      reference,
      operatorCode,
      freeInfo: `Retrait AIFI ${withdrawal.id}`,
    });
  } catch (err: any) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", rawInitResponse: { error: err.message } },
    });
    throw new Error(`Le retrait automatique a échoué : ${err.message}`);
  }

  const success = result.status === "SUCCESS";
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: { status: success ? "SUCCESS" : "FAILED", providerTransactionId: result.reference_id, rawInitResponse: result as any },
  });

  if (!success) {
    throw new Error(result.message || "Le retrait a été refusé par l'opérateur.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: "APPROVED" },
    });
    await tx.walletEntry.create({
      data: { userId: withdrawal.userId, amount: -withdrawal.amount, reason: "withdrawal_approved" },
    });
    return fresh;
  });

  await logAction({
    adminId,
    action: "withdrawal_approve_auto",
    entityType: "Withdrawal",
    entityId: withdrawalId,
    before: { status: "PENDING" },
    after: { status: "APPROVED", amount: updated.amount, reference, operator: operatorCode },
  });

  await notifyUser(
    updated.userId,
    "withdrawal_approved",
    `Votre retrait de ${updated.amount} FCFA a été envoyé automatiquement sur votre compte ${operatorCode === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money"}.`
  );

  return updated;
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
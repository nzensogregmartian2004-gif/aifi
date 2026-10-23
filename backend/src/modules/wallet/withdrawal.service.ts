import { AppError } from "../../errors";
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
    throw new AppError("MIN_WITHDRAWAL", `Montant minimum de retrait : ${settings.minWithdrawal} FCFA`, { amount: settings.minWithdrawal });
  }
  if (!receivingOperator || !receivingPhone || !receivingName) {
    throw new AppError("RECEIVING_INFO_REQUIRED", "L'opérateur, le numéro et le nom du compte de réception sont obligatoires.");
  }

  const balance = await getWalletBalance(userId);
  if (amount > balance) {
    throw new AppError("INSUFFICIENT_BALANCE", `Solde insuffisant (disponible : ${balance} FCFA)`, { available: balance });
  }

  const withdrawal = await prisma.withdrawal.create({
    data: { userId, amount, receivingOperator, receivingPhone, receivingName, status: "PENDING" },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins(
    "admin_withdrawal_requested",
    { name: user.name, amount }
  );

  return withdrawal;
}

/**
 * Approuve un retrait. Re-vérifie le statut ET le solde AU MOMENT de l'approbation
 * (pas seulement au moment de la demande) dans une transaction, pour éviter qu'un
 * portefeuille devienne négatif si deux retraits sont approuvés coup sur coup.
 *
 * Verrou : le passage PENDING -> APPROVED se fait via un updateMany dont le
 * WHERE porte à la fois sur l'id ET sur status="PENDING" — Postgres ne laisse
 * qu'UNE seule requête concurrente matcher la ligne. Combiné à l'isolation
 * "Serializable" (qui protège aussi le cas de deux retraits DIFFÉRENTS du
 * même utilisateur approuvés en même temps), ça élimine le risque de
 * portefeuille négatif par double approbation. En cas de conflit de
 * sérialisation, Postgres fait échouer l'une des deux transactions
 * (code P2034 côté Prisma) — l'admin voit une erreur et peut simplement
 * relancer l'approbation, rien n'a été débité en double entre-temps.
 */
export async function approveWithdrawal(withdrawalId: string, adminId: string, proofImageUrl: string) {
  if (!proofImageUrl) {
    throw new AppError("PROOF_REQUIRED", "Un justificatif (image) est requis pour approuver un retrait");
  }

  let result;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });

        if (withdrawal.status !== "PENDING") {
          throw new AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
        }

        const entries = await tx.walletEntry.findMany({ where: { userId: withdrawal.userId } });
        const balance = entries.reduce((sum, e) => sum + e.amount, 0);

        if (withdrawal.amount > balance) {
          throw new AppError("INSUFFICIENT_BALANCE", `Solde insuffisant pour approuver ce retrait (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA). Le solde a dû changer depuis la demande.`, { requested: withdrawal.amount, available: balance });
        }

        const locked = await tx.withdrawal.updateMany({
          where: { id: withdrawalId, status: "PENDING" },
          data: { status: "APPROVED", proofImageUrl },
        });
        if (locked.count === 0) {
          throw new AppError("ALREADY_TAKEN", "Ce retrait vient d'être traité par quelqu'un d'autre.");
        }

        await tx.walletEntry.create({
          data: { userId: withdrawal.userId, amount: -withdrawal.amount, reason: "withdrawal_approved" },
        });

        return tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err: any) {
    if (err?.code === "P2034") {
      throw new AppError("CONCURRENT_OPERATION", "Conflit avec une autre opération en cours sur ce compte — réessaie dans un instant.");
    }
    throw err;
  }

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
    { amount: result.amount }
  );

  return result;
}

/**
 * Approuve et envoie un retrait automatiquement via MyPVit (GIVE_CHANGE,
 * synchrone). En cas d'échec, le retrait reste PENDING — l'admin peut
 * réessayer ou basculer sur l'envoi manuel (approveWithdrawal ci-dessus).
 *
 * Verrous (deux problèmes distincts, deux protections) :
 *  1. Double traitement DU MÊME retrait (double-clic, deux admins) : verrouillé
 *     par un updateMany atomique PENDING -> APPROVING, comme pour le
 *     décaissement (voir aid-request.service.ts).
 *  2. Deux retraits DIFFÉRENTS du même utilisateur envoyés en vrai parallèle,
 *     qui dépasseraient ensemble le solde disponible : on débite le
 *     portefeuille tout de suite en même temps qu'on pose le verrou APPROVING
 *     (avant même d'appeler MyPVit), en isolation "Serializable". Comme ça,
 *     le solde reflète immédiatement l'argent "engagé", et la deuxième
 *     tentative concurrente voit un solde insuffisant au lieu de passer en
 *     même temps que la première. Si l'appel MyPVit échoue ensuite, on
 *     rembourse (écriture de portefeuille compensatoire) et on repasse le
 *     retrait en PENDING pour permettre une nouvelle tentative.
 */
export async function approveWithdrawalViaMypvit(withdrawalId: string, adminId: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { user: true } });
  if (withdrawal.status !== "PENDING") {
    throw new AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
  }
  if (!withdrawal.receivingOperator || !withdrawal.receivingPhone) {
    throw new AppError("NO_RECEIVING_INFO", "Ce retrait n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const entries = await tx.walletEntry.findMany({ where: { userId: withdrawal.userId } });
        const balance = entries.reduce((sum, e) => sum + e.amount, 0);
        if (withdrawal.amount > balance) {
          throw new AppError("INSUFFICIENT_BALANCE", `Solde insuffisant (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA).`, { requested: withdrawal.amount, available: balance });
        }

        const locked = await tx.withdrawal.updateMany({
          where: { id: withdrawalId, status: "PENDING" },
          data: { status: "APPROVING" },
        });
        if (locked.count === 0) {
          throw new AppError("DISBURSE_IN_PROGRESS", "Ce retrait est déjà en cours ou a déjà été traité par quelqu'un d'autre.");
        }

        await tx.walletEntry.create({
          data: { userId: withdrawal.userId, amount: -withdrawal.amount, reason: "withdrawal_approved" },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err: any) {
    if (err?.code === "P2034") {
      throw new AppError("CONCURRENT_OPERATION", "Conflit avec une autre opération en cours sur ce compte — réessaie dans un instant.");
    }
    throw err;
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

  // Repasse le retrait en PENDING et rembourse le débit déjà posé ci-dessus,
  // pour qu'un échec MyPVit ne laisse jamais le solde amputé pour rien.
  async function releaseReservation(reason: string) {
    await prisma.$transaction([
      prisma.withdrawal.update({ where: { id: withdrawalId }, data: { status: "PENDING" } }),
      prisma.walletEntry.create({
        data: { userId: withdrawal.userId, amount: withdrawal.amount, reason },
      }),
    ]);
  }

  let result;
  try {
    result = await giveChange({
      amount: withdrawal.amount,
      phone: withdrawal.receivingPhone,
      reference,
      operatorCode,
      freeInfo: "AIFI",
    });
  } catch (err: any) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", rawInitResponse: { error: err.message } },
    });
    await releaseReservation("withdrawal_retry_after_error");
    throw new AppError("PAYOUT_FAILED", `Le retrait automatique a échoué : ${err.message}`);
  }

  const success = result.status === "SUCCESS";
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: { status: success ? "SUCCESS" : "FAILED", providerTransactionId: result.reference_id, rawInitResponse: result as any },
  });

  if (!success) {
    await releaseReservation("withdrawal_retry_after_rejection");
    throw new AppError("PAYOUT_FAILED", result.message || "Le retrait a été refusé par l'opérateur.");
  }

  const updated = await prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: { status: "APPROVED" },
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
    "withdrawal_approved_auto",
    { amount: updated.amount, operator: operatorCode === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money" }
  );

  return updated;
}

export async function rejectWithdrawal(withdrawalId: string, adminId: string) {
  const existing = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  if (existing.status !== "PENDING") {
    throw new AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${existing.status})`);
  }

  const locked = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  if (locked.count === 0) {
    throw new AppError("ALREADY_TAKEN", "Ce retrait a déjà été traité par quelqu'un d'autre.");
  }

  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });

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
    { amount: withdrawal.amount }
  );

  return withdrawal;
}
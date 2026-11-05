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

const OPERATOR_LABEL: Record<string, string> = { AIRTEL_MONEY: "Airtel Money", MOOV_MONEY: "Moov Money" };

/**
 * Envoi automatique d'un retrait via MyPVit (GIVE_CHANGE).
 *
 * Règle centrale : on ne rembourse JAMAIS le portefeuille sur un résultat incertain.
 * Une erreur réseau, un timeout ou un statut PENDING ne prouvent pas que l'argent n'est pas
 * parti : rembourser puis relancer pourrait donc payer deux fois. Dans ces cas, le retrait
 * passe en APPROVING (« envoi incertain »). Rien n'est relancé automatiquement : un
 * administrateur tranche après vérification chez MyPVit (voir resolveUncertainWithdrawal).
 *
 * Seul un refus explicite de MyPVit (statut FAILED) annule l'envoi et rembourse le client.
 *
 * Déroulé :
 *  1. Une transaction Serializable fait passer le retrait de PENDING à APPROVING, enregistre
 *     la référence de cet envoi et débite le portefeuille. Un second clic ou un second admin
 *     échoue sur ce verrou.
 *  2. L'appel GIVE_CHANGE part avec cette référence, propre à cet envoi.
 */
export async function approveWithdrawalViaMypvit(withdrawalId: string, adminId: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: withdrawalId },
    include: { user: true },
  });
  if (withdrawal.status === "APPROVING") {
    throw new AppError(
      "PAYOUT_UNCERTAIN",
      "Un envoi est déjà en cours ou son résultat n'est pas confirmé. Vérifie-le chez MyPVit, puis résous le retrait sans relancer l'envoi."
    );
  }
  if (withdrawal.status !== "PENDING") {
    throw new AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
  }
  if (!withdrawal.receivingOperator || !withdrawal.receivingPhone) {
    throw new AppError("NO_RECEIVING_INFO", "Ce retrait n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
  }

  const operatorCode = withdrawal.receivingOperator as "AIRTEL_MONEY" | "MOOV_MONEY";
  const reference = generateDisbursementReference();

  try {
    await prisma.$transaction(
      async (tx) => {
        const entries = await tx.walletEntry.findMany({ where: { userId: withdrawal.userId } });
        const balance = entries.reduce((sum, e) => sum + e.amount, 0);
        if (withdrawal.amount > balance) {
          throw new AppError(
            "INSUFFICIENT_BALANCE",
            `Solde insuffisant (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA).`,
            { requested: withdrawal.amount, available: balance }
          );
        }

        const locked = await tx.withdrawal.updateMany({
          where: { id: withdrawalId, status: "PENDING" },
          data: { status: "APPROVING", payoutReference: reference },
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
    // Résultat inconnu : on ne rembourse pas et on ne relance pas.
    await notifyPayoutUncertain(withdrawal.user.name, withdrawal.amount, reference);
    throw new AppError(
      "PAYOUT_UNCERTAIN",
      `Envoi non confirmé (${err?.message ?? "erreur inconnue"}). Vérifie chez MyPVit avec la référence ${reference}, puis résous le retrait sans relancer l'envoi.`,
      { reference }
    );
  }

  const status = String(result.status ?? "").toUpperCase();

  if (status === "FAILED") {
    // Refus explicite de MyPVit : l'argent n'est pas parti. Remboursement, retrait de nouveau en attente.
    await releasePayoutReservation(withdrawalId, "withdrawal_not_sent");
    throw new AppError("PAYOUT_FAILED", result.message || "Le retrait a été refusé par l'opérateur.");
  }

  if (status !== "SUCCESS") {
    // PENDING ou réponse non reconnue : MyPVit n'a pas tranché, on ne sait pas si l'argent est parti.
    await notifyPayoutUncertain(withdrawal.user.name, withdrawal.amount, reference);
    throw new AppError(
      "PAYOUT_UNCERTAIN",
      `MyPVit n'a pas confirmé l'envoi (statut : ${status || "inconnu"}). Vérifie chez MyPVit avec la référence ${reference}, puis résous le retrait sans relancer l'envoi.`,
      { reference }
    );
  }

  const updated = await markPayoutSent(withdrawalId);

  await logAction({
    adminId,
    action: "withdrawal_approve_auto",
    entityType: "Withdrawal",
    entityId: withdrawalId,
    before: { status: "PENDING" },
    after: { status: "APPROVED", amount: updated.amount, reference, operator: operatorCode },
  });

  await notifyUser(updated.userId, "withdrawal_approved_auto", {
    amount: updated.amount,
    operator: OPERATOR_LABEL[operatorCode] ?? "",
  });

  return updated;
}

async function notifyPayoutUncertain(name: string, amount: number, reference: string) {
  await notifyAdmins("admin_payout_uncertain", { name, amount, reference }).catch(() => {});
}

/** APPROVING -> APPROVED : l'envoi est confirmé. */
async function markPayoutSent(withdrawalId: string) {
  const locked = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "APPROVING" },
    data: { status: "APPROVED" },
  });
  if (locked.count === 0) {
    throw new AppError("ALREADY_PROCESSED", "Ce retrait n'est plus en envoi incertain.");
  }
  return prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
}

/** APPROVING -> PENDING et remboursement du portefeuille : l'envoi n'a pas eu lieu. */
async function releasePayoutReservation(withdrawalId: string, reason: string) {
  await prisma.$transaction(
    async (tx) => {
      const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
      const locked = await tx.withdrawal.updateMany({
        where: { id: withdrawalId, status: "APPROVING" },
        data: { status: "PENDING", payoutReference: null },
      });
      if (locked.count === 0) {
        throw new AppError("ALREADY_PROCESSED", "Ce retrait n'est plus en envoi incertain.");
      }
      await tx.walletEntry.create({
        data: { userId: withdrawal.userId, amount: withdrawal.amount, reason },
      });
    },
    { isolationLevel: "Serializable" }
  );
}

/**
 * Résolution d'un envoi incertain par un administrateur, après vérification chez MyPVit
 * (référence affichée dans l'écran du retrait). Aucune relance automatique. Le choix et la
 * note de l'admin sont tracés dans le journal.
 *  - PAID : l'argent est bien parti. Le retrait passe en APPROVED, sans nouveau débit.
 *  - NOT_PAID : l'argent n'est pas parti. Le client est remboursé et le retrait repasse en
 *    PENDING, pour un nouvel envoi avec une nouvelle référence.
 */
export async function resolveUncertainWithdrawal(
  withdrawalId: string,
  adminId: string,
  outcome: "PAID" | "NOT_PAID",
  note: string
) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: withdrawalId },
    include: { user: true },
  });
  if (withdrawal.status !== "APPROVING") {
    throw new AppError("ALREADY_PROCESSED", `Ce retrait n'est pas en envoi incertain (statut actuel : ${withdrawal.status})`);
  }
  const reference = withdrawal.payoutReference;

  if (outcome === "PAID") {
    const updated = await markPayoutSent(withdrawalId);
    await logAction({
      adminId,
      action: "withdrawal_resolve_paid",
      entityType: "Withdrawal",
      entityId: withdrawalId,
      before: { status: "APPROVING" },
      after: { status: "APPROVED", reference },
      note,
    });
    await notifyUser(updated.userId, "withdrawal_approved_auto", {
      amount: updated.amount,
      operator: OPERATOR_LABEL[withdrawal.receivingOperator ?? ""] ?? "",
    });
    return updated;
  }

  await releasePayoutReservation(withdrawalId, "withdrawal_not_sent");
  await logAction({
    adminId,
    action: "withdrawal_resolve_not_sent",
    entityType: "Withdrawal",
    entityId: withdrawalId,
    before: { status: "APPROVING" },
    after: { status: "PENDING", reference },
    note,
  });
  return prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
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
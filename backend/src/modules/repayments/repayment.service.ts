import { AMOUNT_EPSILON, isSettled } from "../finance/rules";
import { AppError } from "../../errors";
import { assertOwnUpload } from "../uploads/upload-ownership";
import { prisma } from "../../db/client";
import { addPoints } from "../points/points.service";
import { creditWallet } from "../wallet/wallet.service";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";

export async function getRemainingAmount(aidRequestId: string): Promise<number> {
  const aidRequest = await prisma.aidRequest.findUniqueOrThrow({
    where: { id: aidRequestId },
    include: { repayments: true },
  });
  const totalRepaid = aidRequest.repayments.reduce((sum, r) => sum + r.amount, 0);
  return aidRequest.amountDue - totalRepaid;
}

export async function recordRepayment(aidRequestId: string, amount: number, adminId?: string, proofImageUrl?: string) {
  // Transaction pour éviter une course entre deux remboursements enregistrés en même temps
  let result;
  try {
  result = await prisma.$transaction(async (tx) => {
    const aidRequest = await tx.aidRequest.findUniqueOrThrow({
      where: { id: aidRequestId },
      include: { repayments: true },
    });

    const totalRepaidBefore = aidRequest.repayments.reduce((s, r) => s + r.amount, 0);
    const remainingBefore = aidRequest.amountDue - totalRepaidBefore;

    if (amount <= 0) {
      throw new AppError("AMOUNT_NOT_POSITIVE", "Le montant du remboursement doit être positif");
    }
    if (amount > remainingBefore + AMOUNT_EPSILON) {
      throw new AppError("REPAYMENT_EXCEEDS_DUE", `Le remboursement (${amount}) dépasse le montant restant dû (${remainingBefore})`, { amount, remaining: remainingBefore });
    }

    const isPartial = !isSettled(remainingBefore - amount);

    await tx.repayment.create({
      data: { aidRequestId, amount, isPartial, proofImageUrl },
    });

    const borrower = await tx.user.findUniqueOrThrow({ where: { id: aidRequest.userId } });

    if (borrower.referredById) {
      const sponsor = await tx.user.findUniqueOrThrow({ where: { id: borrower.referredById } });
      // Commission sur remboursement des filleuls = avantage réservé à AIFI+.
      // Le bonus de parrainage initial (à l'inscription du filleul) reste,
      // lui, ouvert à tout le monde — seule cette commission récurrente est premium.
      if (sponsor.isPremium) {
        const settings = await tx.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
        const commission = Math.floor((amount * settings.commissionPercent) / 100);
        if (commission > 0) {
          await tx.walletEntry.create({
            data: { userId: borrower.referredById, amount: commission, reason: "referral_commission" },
          });
        }
      }
    }

    const remainingAfter = remainingBefore - amount;

    if (isSettled(remainingAfter)) {
      const wasOnTime = !aidRequest.dueDate || new Date() <= aidRequest.dueDate;

      await tx.aidRequest.update({
        where: { id: aidRequestId },
        data: { status: "REPAID" },
      });

      if (wasOnTime) {
        await addPoints(aidRequest.userId, 10, "remboursement_a_temps");

        // Série : un bonus tous les N remboursements à temps d'affilée (paramètres admin).
        const settings = await tx.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
        const { onTimeStreak } = await tx.user.update({
          where: { id: aidRequest.userId },
          data: { onTimeStreak: { increment: 1 } },
          select: { onTimeStreak: true },
        });
        if (settings.streakLength > 0 && onTimeStreak % settings.streakLength === 0) {
          await addPoints(aidRequest.userId, settings.streakBonusPoints, "serie_remboursements");
          await notifyUser(
            aidRequest.userId,
            "streak_bonus",
            { streak: settings.streakLength, points: settings.streakBonusPoints }
          );
        }
      } else {
        // Un retard casse la série.
        await tx.user.update({ where: { id: aidRequest.userId }, data: { onTimeStreak: 0 } });
      }
    }

    return { remainingAfter, isPartial, fullyRepaid: isSettled(remainingAfter), userId: aidRequest.userId };
  }, { isolationLevel: "Serializable" });
  } catch (err: any) {
    if (err?.code === "P2034") {
      throw new AppError("CONCURRENT_OPERATION", "Un autre remboursement est en cours sur cette aide. Réessaie dans un instant.");
    }
    throw err;
  }

  if (adminId) {
    await logAction({
      adminId,
      action: "repayment_record_direct",
      entityType: "AidRequest",
      entityId: aidRequestId,
      after: { amount, remainingAfter: result.remainingAfter, fullyRepaid: result.fullyRepaid },
    });
  }

  await notifyUser(
    result.userId,
    result.fullyRepaid ? "repayment_recorded_full" : "repayment_recorded",
    { amount, remaining: result.remainingAfter },
    aidRequestId
  );

  return result;
}

/**
 * Le client déclare avoir remboursé un montant (hors application, ex: Mobile Money
 * envoyé directement à l'administrateur). Cela crée une déclaration en attente et
 * notifie les administrateurs, qui confirmeront manuellement après vérification.
 * Cela ne modifie ni le plafond ni les points tant que ce n'est pas confirmé.
 *
 * Le montant minimum d'une avance de remboursement (settings.minRepaymentAmount,
 * 500 FCFA par défaut) s'applique, SAUF si le montant déclaré correspond au solde
 * restant dû dans son intégralité (on ne bloque jamais le dernier paiement qui
 * solde la dette, même s'il est inférieur au minimum).
 */
export async function declareRepayment(
  userId: string,
  aidRequestId: string,
  amount: number,
  note?: string,
  proofImageUrl?: string
) {
  const aidRequest = await prisma.aidRequest.findUniqueOrThrow({
    where: { id: aidRequestId },
    include: { repayments: true },
  });

  if (aidRequest.userId !== userId) {
    throw new AppError("AID_NOT_OWNED", "Cette demande d'aide ne vous appartient pas");
  }
  if (!["ACCEPTED", "DISBURSED", "LATE"].includes(aidRequest.status)) {
    throw new AppError("AID_NOT_REPAYABLE", "Cette demande n'est pas en cours de remboursement");
  }
  if (!amount || amount <= 0) {
    throw new AppError("AMOUNT_NOT_POSITIVE", "Le montant doit être positif");
  }

  await assertOwnUpload(proofImageUrl, userId);

  const totalRepaid = aidRequest.repayments.reduce((s, r) => s + r.amount, 0);
  const remaining = aidRequest.amountDue - totalRepaid;
  if (amount > remaining + AMOUNT_EPSILON) {
    throw new AppError("REPAYMENT_EXCEEDS_DUE", `Le montant déclaré (${amount}) dépasse le montant restant dû (${remaining})`, { amount, remaining });
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const isFinalPayment = isSettled(amount - remaining);
  if (!isFinalPayment && amount < settings.minRepaymentAmount) {
    throw new AppError(
      "MIN_REPAYMENT_AMOUNT",
      `Le montant minimum d'une avance de remboursement est de ${settings.minRepaymentAmount} FCFA (sauf pour solder complètement le reste dû de ${remaining} FCFA).`,
      { minAmount: settings.minRepaymentAmount, remaining }
    );
  }

  const declaration = await prisma.repaymentDeclaration.create({
    data: { aidRequestId, userId, amount, note, proofImageUrl },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins(
    "admin_repayment_declared",
    { name: user.name, amount, requested: aidRequest.amount, due: aidRequest.amountDue },
    aidRequestId
  );

  return declaration;
}

export async function confirmRepaymentDeclaration(declarationId: string, adminId: string, proofImageUrl?: string) {
  const declaration = await prisma.repaymentDeclaration.findUniqueOrThrow({
    where: { id: declarationId },
  });
  if (declaration.status !== "PENDING") {
    throw new AppError("ALREADY_PROCESSED", "Cette déclaration a déjà été traitée");
  }

  // Verrou atomique : seule UNE confirmation concurrente de cette déclaration
  // peut passer (WHERE id + status="PENDING"). Sans ça, deux admins qui
  // confirment la même déclaration en même temps pouvaient enregistrer deux
  // remboursements pour un seul paiement réel.
  const locked = await prisma.repaymentDeclaration.updateMany({
    where: { id: declarationId, status: "PENDING" },
    data: { status: "CONFIRMED", resolvedAt: new Date() },
  });
  if (locked.count === 0) {
    throw new AppError("ALREADY_TAKEN", "Cette déclaration vient d'être traitée par quelqu'un d'autre.");
  }

  let result;
  try {
    result = await recordRepayment(
      declaration.aidRequestId,
      declaration.amount,
      undefined,
      proofImageUrl || declaration.proofImageUrl || undefined
    );
  } catch (err) {
    // recordRepayment a son propre contrôle (le montant ne peut pas dépasser
    // le reste dû) : s'il échoue, on relâche le verrou pour ne pas laisser la
    // déclaration bloquée en CONFIRMED sans remboursement réellement enregistré.
    await prisma.repaymentDeclaration.update({
      where: { id: declarationId },
      data: { status: "PENDING", resolvedAt: null },
    });
    throw err;
  }

  await logAction({
    adminId,
    action: "repayment_declaration_confirm",
    entityType: "RepaymentDeclaration",
    entityId: declarationId,
    before: { status: "PENDING" },
    after: { status: "CONFIRMED", amount: declaration.amount, aidRequestId: declaration.aidRequestId },
  });

  return result;
}

export async function rejectRepaymentDeclaration(declarationId: string, adminId: string, reason?: string) {
  const declaration = await prisma.repaymentDeclaration.findUniqueOrThrow({
    where: { id: declarationId },
  });
  if (declaration.status !== "PENDING") {
    throw new AppError("ALREADY_PROCESSED", "Cette déclaration a déjà été traitée");
  }

  const locked = await prisma.repaymentDeclaration.updateMany({
    where: { id: declarationId, status: "PENDING" },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
  if (locked.count === 0) {
    throw new AppError("ALREADY_TAKEN", "Cette déclaration vient d'être traitée par quelqu'un d'autre.");
  }

  await logAction({
    adminId,
    action: "repayment_declaration_reject",
    entityType: "RepaymentDeclaration",
    entityId: declarationId,
    before: { status: "PENDING" },
    after: { status: "REJECTED" },
    note: reason,
  });

  await notifyUser(
    declaration.userId,
    reason ? "repayment_declaration_rejected_reason" : "repayment_declaration_rejected",
    { amount: declaration.amount, reason: reason ?? "" },
    declaration.aidRequestId
  );

  return declaration;
}

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
  const result = await prisma.$transaction(async (tx) => {
    const aidRequest = await tx.aidRequest.findUniqueOrThrow({
      where: { id: aidRequestId },
      include: { repayments: true },
    });

    const totalRepaidBefore = aidRequest.repayments.reduce((s, r) => s + r.amount, 0);
    const remainingBefore = aidRequest.amountDue - totalRepaidBefore;

    if (amount <= 0) {
      throw new Error("Le montant du remboursement doit être positif");
    }
    if (amount > remainingBefore) {
      throw new Error(`Le remboursement (${amount}) dépasse le montant restant dû (${remainingBefore})`);
    }

    const isPartial = amount < remainingBefore;

    await tx.repayment.create({
      data: { aidRequestId, amount, isPartial, proofImageUrl },
    });

    const borrower = await tx.user.findUniqueOrThrow({ where: { id: aidRequest.userId } });

    if (borrower.referredById) {
      const settings = await tx.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      const commission = Math.floor((amount * settings.commissionPercent) / 100);
      if (commission > 0) {
        await tx.walletEntry.create({
          data: { userId: borrower.referredById, amount: commission, reason: "referral_commission" },
        });
      }
    }

    const remainingAfter = remainingBefore - amount;

    if (remainingAfter === 0) {
      const wasOnTime = !aidRequest.dueDate || new Date() <= aidRequest.dueDate;

      await tx.aidRequest.update({
        where: { id: aidRequestId },
        data: { status: "REPAID" },
      });

      if (wasOnTime) {
        await addPoints(aidRequest.userId, 10, "remboursement_a_temps");
      }
    }

    return { remainingAfter, isPartial, fullyRepaid: remainingAfter === 0, userId: aidRequest.userId };
  });

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
    "repayment_recorded",
    result.fullyRepaid
      ? `Votre aide de ${amount} FCFA a été entièrement remboursée. Merci !`
      : `Un remboursement de ${amount} FCFA a été enregistré. Reste dû : ${result.remainingAfter} FCFA.`,
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
    throw new Error("Cette demande d'aide ne vous appartient pas");
  }
  if (!["ACCEPTED", "DISBURSED", "LATE"].includes(aidRequest.status)) {
    throw new Error("Cette demande n'est pas en cours de remboursement");
  }
  if (!amount || amount <= 0) {
    throw new Error("Le montant doit être positif");
  }

  const totalRepaid = aidRequest.repayments.reduce((s, r) => s + r.amount, 0);
  const remaining = aidRequest.amountDue - totalRepaid;
  if (amount > remaining) {
    throw new Error(`Le montant déclaré (${amount}) dépasse le montant restant dû (${remaining})`);
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const isFinalPayment = amount === remaining;
  if (!isFinalPayment && amount < settings.minRepaymentAmount) {
    throw new Error(
      `Le montant minimum d'une avance de remboursement est de ${settings.minRepaymentAmount} FCFA (sauf pour solder complètement le reste dû de ${remaining} FCFA).`
    );
  }

  const declaration = await prisma.repaymentDeclaration.create({
    data: { aidRequestId, userId, amount, note, proofImageUrl },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins(
    "repayment_declared",
    `${user.name} déclare avoir remboursé ${amount} FCFA sur sa demande de ${aidRequest.amount} FCFA (à rembourser : ${aidRequest.amountDue} FCFA).`,
    aidRequestId
  );

  return declaration;
}

export async function confirmRepaymentDeclaration(declarationId: string, adminId: string, proofImageUrl?: string) {
  const declaration = await prisma.repaymentDeclaration.findUniqueOrThrow({
    where: { id: declarationId },
  });
  if (declaration.status !== "PENDING") {
    throw new Error("Cette déclaration a déjà été traitée");
  }

  const result = await recordRepayment(
    declaration.aidRequestId,
    declaration.amount,
    undefined,
    proofImageUrl || declaration.proofImageUrl || undefined
  );

  await prisma.repaymentDeclaration.update({
    where: { id: declarationId },
    data: { status: "CONFIRMED", resolvedAt: new Date() },
  });

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
    throw new Error("Cette déclaration a déjà été traitée");
  }

  await prisma.repaymentDeclaration.update({
    where: { id: declarationId },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });

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
    "repayment_declaration_rejected",
    `Votre déclaration de remboursement de ${declaration.amount} FCFA n'a pas été confirmée${
      reason ? ` : ${reason}` : ""
    }. Contactez l'administrateur.`,
    declaration.aidRequestId
  );

  return declaration;
}

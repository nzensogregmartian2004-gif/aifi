import { AppError } from "../../errors";
import { withSerializationRetry } from "../../db/retry";
import { availableCeiling, assertDueChoice, flexibleAmountDue, dueDateChoiceRange } from "../finance/rules";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";
import { giveChange, generateDisbursementReference } from "../payments/mypvit.client";
import { computeDurationForAmount } from "../durations/duration-tier.service";

type Db = Prisma.TransactionClient;

/**
 * Plafond disponible = plafond du client moins le capital encore dû sur toutes
 * ses demandes engagées. Les demandes EN ATTENTE comptent déjà : sinon un client
 * pouvait en envoyer plusieurs, chacune sous le plafond, puis les faire accepter.
 */
export async function computeAvailableCeiling(db: Db, userId: string): Promise<number> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const openRequests = await db.aidRequest.findMany({
    where: { userId, status: { in: ["PENDING", "ACCEPTED", "DISBURSING", "DISBURSED", "LATE"] } },
    include: { repayments: true },
  });

  return availableCeiling(
    user.ceiling,
    openRequests.map((r) => ({
      amount: r.amount,
      repaid: r.repayments.reduce((s, rep) => s + rep.amount, 0),
    }))
  );
}

export async function getAvailableCeiling(userId: string): Promise<number> {
  return computeAvailableCeiling(prisma, userId);
}

/**
 * Conditions d'une demande, calculées ici pour le devis ET pour la création : ce qui
 * est affiché au client est exactement ce qui sera enregistré.
 * - Par défaut : durée et montant de la grille (fixés à la date de la demande).
 * - À partir de flexibleDueMinPoints points : durée choisie, montant recalculé à
 *   partir des intérêts de la grille ; maximum = double de la grille.
 * - Le sursis (graceDays) est figé à la demande.
 */
async function computeRequestTerms(userId: string, amount: number, requestedDurationDays?: number) {
  if (!amount || amount <= 0) {
    throw new AppError("AMOUNT_NOT_POSITIVE", "Le montant demandé doit être positif");
  }
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });

  const { tierAmount, durationDays: gridDurationDays } = await computeDurationForAmount(amount);
  // Le taux ET la durée sont figés à la date de la demande : les modifier plus
  // tard dans les paramètres n'affecte jamais une demande déjà créée.
  const feePercent = requester.isPremium ? settings.premiumServiceFeePercent : settings.serviceFeePercent;
  const gridAmountDue = Math.round(amount * (1 + feePercent / 100));
  const interestAmount = gridAmountDue - amount;

  const chosenDurationDays = requestedDurationDays ?? gridDurationDays;
  assertDueChoice({
    chosenDurationDays,
    gridDurationDays,
    points: requester.points,
    minPoints: settings.flexibleDueMinPoints,
    minDays: settings.flexibleDueMinDays,
  });

  const amountDue = flexibleAmountDue(amount, gridAmountDue, gridDurationDays, chosenDurationDays);
  const dueDate = new Date(Date.now() + chosenDurationDays * 24 * 60 * 60 * 1000);
  const graceDays = requester.isPremium ? settings.premiumGraceDays : settings.standardGraceDays;

  return {
    requester,
    settings,
    tierAmount,
    feePercent,
    gridDurationDays,
    gridAmountDue,
    interestAmount,
    chosenDurationDays,
    amountDue,
    dueDate,
    graceDays,
  };
}

/** Devis affiché au client avant confirmation (montant, échéance, sursis, possibilité de choisir la date). */
export async function quoteAidRequest(userId: string, amount: number, requestedDurationDays?: number) {
  const terms = await computeRequestTerms(userId, amount, requestedDurationDays);
  const range = dueDateChoiceRange(terms.gridDurationDays, terms.settings.flexibleDueMinDays);
  return {
    amount,
    feePercent: terms.feePercent,
    gridDurationDays: terms.gridDurationDays,
    gridAmountDue: terms.gridAmountDue,
    chosenDurationDays: terms.chosenDurationDays,
    amountDue: terms.amountDue,
    interestPerDay: Math.round(terms.interestAmount / terms.gridDurationDays),
    dueDate: terms.dueDate.toISOString(),
    graceDays: terms.graceDays,
    canChooseDueDate: terms.requester.points >= terms.settings.flexibleDueMinPoints && range.allowed,
    minPoints: terms.settings.flexibleDueMinPoints,
    minDays: range.minDays,
    maxDays: range.maxDays,
  };
}

export async function requestAid(
  userId: string,
  amount: number,
  receivingOperator: "AIRTEL_MONEY" | "MOOV_MONEY",
  receivingPhone: string,
  receivingName: string,
  requestedDurationDays?: number
) {
  if (!receivingOperator || !receivingPhone || !receivingName) {
    throw new AppError("RECEIVING_INFO_REQUIRED", "L'opérateur, le numéro et le nom du compte de réception sont obligatoires.");
  }

  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.status !== "ACTIVE") {
    throw new AppError("ACCOUNT_NOT_ACTIVE", "Ton compte doit d’abord être validé");
  }

  const terms = await computeRequestTerms(userId, amount, requestedDurationDays);

  // Contrôle du plafond ET création dans une même transaction Serializable :
  // deux demandes simultanées ne peuvent plus lire le même plafond libre.
  let request;
  try {
    request = await withSerializationRetry(() => prisma.$transaction(
      async (tx) => {
        const available = await computeAvailableCeiling(tx, userId);
        if (amount > available) {
          throw new AppError("CEILING_EXCEEDED", `Montant demandé (${amount}) dépasse le plafond disponible (${available})`, { amount, available });
        }
        return tx.aidRequest.create({
          data: {
            userId,
            amount,
            amountDue: terms.amountDue,
            baseAmountDue: terms.amountDue,
            dueDate: terms.dueDate,
            durationDays: terms.chosenDurationDays,
            durationTierAmount: terms.tierAmount,
            gridDurationDays: terms.gridDurationDays,
            interestAmount: terms.interestAmount,
            graceDays: terms.graceDays,
            receivingOperator,
            receivingPhone,
            receivingName,
            status: "PENDING",
          },
        });
      },
      { isolationLevel: "Serializable" }
    ));
  } catch (err: any) {
    if (err?.code === "P2034") {
      throw new AppError("CONCURRENT_OPERATION", "Une autre demande est en cours de traitement. Réessaie dans un instant.");
    }
    throw err;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await notifyAdmins("admin_aid_request_created", { name: user.name, amount }, request.id);

  return request;
}

export async function acceptAidRequest(id: string, adminId: string) {
  // Le plafond est revérifié à l'acceptation : il a pu changer depuis la demande
  // (points, début ou fin d'AIFI+, réglage admin). Tout se passe dans une
  // transaction Serializable : une seule acceptation concurrente peut passer.
  let outcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.aidRequest.findUniqueOrThrow({ where: { id } });
        if (existing.status !== "PENDING") {
          throw new AppError("ALREADY_PROCESSED", `Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
        }

        const available = await computeAvailableCeiling(tx, existing.userId);
        if (available < 0) {
          throw new AppError(
            "CEILING_OVER",
            `Plafond dépassé pour ce client (${-available} FCFA au-dessus). Refuse la demande ou ajuste le plafond avant d'accepter.`,
            { excess: -available }
          );
        }

        const locked = await tx.aidRequest.updateMany({
          where: { id, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
        if (locked.count === 0) {
          throw new AppError("ALREADY_TAKEN", "Cette demande vient d'être traitée par quelqu'un d'autre.");
        }

        const request = await tx.aidRequest.findUniqueOrThrow({ where: { id } });
        return { existing, request };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err: any) {
    if (err?.code === "P2034") {
      throw new AppError("CONCURRENT_OPERATION", "Conflit avec une autre opération sur ce client — réessaie dans un instant.");
    }
    throw err;
  }

  const { existing, request } = outcome;

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
    { amount: request.amount, dueDate: request.dueDate ? request.dueDate.toISOString() : "" },
    request.id
  );

  return request;
}

export async function rejectAidRequest(id: string, adminId: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "PENDING") {
    throw new AppError("ALREADY_PROCESSED", `Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
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
    { amount: request.amount },
    request.id
  );

  return request;
}

export async function disburseAidRequest(id: string, adminId: string, note?: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "ACCEPTED") {
    throw new AppError("DISBURSE_NOT_ACCEPTED", `Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
  }

  // Même verrou atomique que la voie MyPVit (§ci-dessous) : évite deux
  // marquages "envoyé" en double (deux notifications, deux logs d'audit) sur
  // un double-clic ou deux admins simultanés.
  const locked = await prisma.aidRequest.updateMany({
    where: { id, status: "ACCEPTED" },
    data: { status: "DISBURSED" },
  });
  if (locked.count === 0) {
    throw new AppError("ALREADY_TAKEN", "Cette demande a déjà été traitée par quelqu'un d'autre.");
  }

  const request = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });

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
    { amount: request.amount },
    request.id
  );
  const beneficiary = await prisma.user.findUnique({ where: { id: request.userId }, select: { name: true } });
  await notifyAdmins("admin_aid_disbursed", { name: beneficiary?.name ?? "", amount: request.amount }, request.id).catch(() => {});

  return request;
}

/**
 * Décaissement MyPVit avec journal préalable et référence stable.
 * La réservation (DISBURSING + PaymentTransaction PENDING) est atomique et
 * validée AVANT l'appel réseau. Un timeout conserve l'état incertain : jamais
 * de nouvel envoi automatique sur une réponse ambiguë.
 */
export async function disburseAidRequestViaMypvit(id: string, adminId: string) {
  const existing = await prisma.aidRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
  if (existing.status !== "ACCEPTED") {
    throw new AppError("DISBURSE_NOT_ACCEPTED", `Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
  }
  if (!existing.receivingOperator || !existing.receivingPhone) {
    throw new AppError("NO_RECEIVING_INFO", "Cette demande n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
  }

  const operator = existing.receivingOperator as "AIRTEL_MONEY" | "MOOV_MONEY";
  const reference = generateDisbursementReference();
  // Le statut et la transaction existent durablement avant tout effet externe.
  await prisma.$transaction(async (tx) => {
    const locked = await tx.aidRequest.updateMany({
      where: { id, status: "ACCEPTED" },
      data: { status: "DISBURSING", payoutReference: reference },
    });
    if (locked.count !== 1) {
      throw new AppError("DISBURSE_IN_PROGRESS", "Ce décaissement est déjà en cours ou a déjà été traité.");
    }
    await tx.paymentTransaction.create({
      data: {
        reference, userId: existing.userId, aidRequestId: id,
        amount: existing.amount, operator, status: "PENDING",
        purpose: "DISBURSEMENT",
      },
    });
  });

  const uncertain = (detail: string) => new AppError(
    "PAYOUT_UNCERTAIN",
    `${detail} Vérifie chez MyPVit avec la référence ${reference}. Ne relance pas automatiquement cet envoi.`,
    { reference }
  );

  let result: Awaited<ReturnType<typeof giveChange>>;
  try {
    result = await giveChange({
      amount: existing.amount,
      phone: existing.receivingPhone,
      reference,
      operatorCode: operator,
      freeInfo: "AIFI",
    });
  } catch (err: any) {
    // L'appel a pu atteindre MyPVit avant la coupure : PENDING + DISBURSING restent réservés.
    await notifyAdmins("admin_aid_payout_uncertain", {
      name: existing.user.name, amount: existing.amount, reference,
    }).catch(() => {});
    throw uncertain(`Résultat réseau non confirmé (${err?.message ?? "erreur inconnue"}).`);
  }

  const providerStatus = String(result.status ?? "").toUpperCase();
  if (providerStatus === "FAILED") {
    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { reference },
        data: { status: "FAILED", providerTransactionId: result.reference_id ?? null, rawInitResponse: result as any },
      });
      const released = await tx.aidRequest.updateMany({
        where: { id, status: "DISBURSING", payoutReference: reference },
        data: { status: "ACCEPTED", payoutReference: null },
      });
      if (released.count !== 1) throw new AppError("PAYOUT_STATE_CONFLICT", "Le statut de la demande a changé pendant le décaissement.");
      await logAction({
        adminId, action: "aid_request_disburse_failed", entityType: "AidRequest", entityId: id,
        before: { status: "DISBURSING" }, after: { status: "ACCEPTED", reference, providerStatus },
      }, tx);
    });
    throw new AppError("PAYOUT_FAILED", result.message || "Le décaissement a été explicitement refusé par MyPVit.");
  }

  if (providerStatus !== "SUCCESS") {
    await notifyAdmins("admin_aid_payout_uncertain", {
      name: existing.user.name, amount: existing.amount, reference,
    }).catch(() => {});
    throw uncertain(`MyPVit n'a pas confirmé l'envoi (statut : ${providerStatus || "inconnu"}).`);
  }

  const request = await prisma.$transaction(async (tx) => {
    const completed = await tx.aidRequest.updateMany({
      where: { id, status: "DISBURSING", payoutReference: reference },
      data: { status: "DISBURSED" },
    });
    if (completed.count !== 1) throw new AppError("PAYOUT_STATE_CONFLICT", "Le statut de la demande a changé pendant le décaissement.");
    await tx.paymentTransaction.update({
      where: { reference },
      data: { status: "SUCCESS", providerTransactionId: result.reference_id ?? null, rawInitResponse: result as any },
    });
    await logAction({
      adminId, action: "aid_request_disburse_auto", entityType: "AidRequest", entityId: id,
      before: { status: "ACCEPTED" }, after: { status: "DISBURSED", reference, operator },
    }, tx);
    return tx.aidRequest.findUniqueOrThrow({ where: { id } });
  });

  await notifyUser(request.userId, "aid_request_disbursed_auto", {
    amount: request.amount, operator: operator === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money",
  }, request.id);
  await notifyAdmins("admin_aid_disbursed", { name: existing.user.name, amount: request.amount }, request.id).catch(() => {});
  return request;
}

/**
 * Résolution manuelle d'un envoi incertain après vérification du relevé MyPVit.
 * Met à jour la transaction préalable au lieu d'en créer une seconde.
 */
export async function resolveUncertainAid(id: string, adminId: string, outcome: "PAID" | "NOT_PAID", note: string) {
  const aid = await prisma.aidRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
  if (aid.status !== "DISBURSING") {
    throw new AppError("ALREADY_PROCESSED", `Cette demande n'est pas en envoi incertain (statut actuel : ${aid.status})`);
  }
  if (!aid.payoutReference) throw new AppError("NO_PAYOUT_REFERENCE", "Aucune référence d'envoi enregistrée pour cette demande.");
  const reference = aid.payoutReference;
  const operator = aid.receivingOperator ?? "";

  await prisma.$transaction(async (tx) => {
    const changed = await tx.aidRequest.updateMany({
      where: { id, status: "DISBURSING", payoutReference: reference },
      data: outcome === "PAID"
        ? { status: "DISBURSED" }
        : { status: "ACCEPTED", payoutReference: null },
    });
    if (changed.count !== 1) throw new AppError("ALREADY_PROCESSED", "Cette demande vient d'être résolue par un autre administrateur.");

    const transaction = await tx.paymentTransaction.findUnique({ where: { reference } });
    if (transaction) {
      await tx.paymentTransaction.update({
        where: { reference },
        data: {
          status: outcome === "PAID" ? "SUCCESS" : "FAILED",
          rawInitResponse: { resolvedBy: adminId, note, outcome } as any,
        },
      });
    } else {
      // Compatibilité avec les demandes DISBURSING créées avant la V4.
      await tx.paymentTransaction.create({
        data: {
          reference, userId: aid.userId, aidRequestId: id, amount: aid.amount, operator, purpose: "DISBURSEMENT",
          status: outcome === "PAID" ? "SUCCESS" : "FAILED",
          rawInitResponse: { resolvedBy: adminId, note, outcome, legacyRecovery: true } as any,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        adminId, action: outcome === "PAID" ? "aid_resolve_paid" : "aid_resolve_not_sent",
        entityType: "AidRequest", entityId: id,
        before: { status: "DISBURSING" },
        after: { status: outcome === "PAID" ? "DISBURSED" : "ACCEPTED", reference },
        note,
      },
    });
  });

  const request = await prisma.aidRequest.findUniqueOrThrow({ where: { id } });
  if (outcome === "PAID") {
    await notifyUser(aid.userId, "aid_request_disbursed_auto", {
      amount: aid.amount, operator: operator === "AIRTEL_MONEY" ? "Airtel Money" : operator === "MOOV_MONEY" ? "Moov Money" : "",
    }, id);
  }
  return request;
}

import { AppError } from "../../errors";
import { prisma } from "../../db/client";
import { initiatePayment, generatePaymentReference, checkTransactionStatus } from "./mypvit.client";
import { recordRepayment, getRemainingAmount } from "../repayments/repayment.service";
import { notifyUser } from "../notifications/notification.service";
import { OperatorCode } from "../../config/env";
import { recomputeCeilingForUser } from "../points/points.service";
import type { PaymentTransaction } from "@prisma/client";

// Le message d'échec doit rester cohérent avec ce qui a réellement échoué :
// "déclarer un remboursement manuel" n'a aucun sens pour un abonnement AIFI+.
function paymentFailedMessage(purpose: string | null): string {
  return purpose === "PREMIUM_SUBSCRIPTION"
    ? "Ton paiement pour l'abonnement AIFI+ n'a pas abouti. Tu peux réessayer depuis l'écran AIFI+."
    : "Ton paiement Mobile Money n'a pas abouti. Tu peux réessayer ou déclarer un remboursement manuel.";
}

export async function startRepaymentPayment(
  userId: string,
  aidRequestId: string,
  amount: number,
  operatorCode: "AIRTEL_MONEY" | "MOOV_MONEY" | "VISA_MASTERCARD",
  phone: string,
  payerName?: string
) {
  const aidRequest = await prisma.aidRequest.findUniqueOrThrow({ where: { id: aidRequestId } });
  if (aidRequest.userId !== userId) {
    throw new AppError("AID_NOT_OWNED", "Cette aide ne t'appartient pas");
  }
  if (!["ACCEPTED", "DISBURSED", "LATE"].includes(aidRequest.status)) {
    throw new AppError("AID_NOT_REPAYABLE", "Cette aide n'est pas en attente de remboursement");
  }
  if (!amount || amount <= 0) {
    throw new AppError("AMOUNT_NOT_POSITIVE", "Le montant doit être positif");
  }
  if (operatorCode !== "VISA_MASTERCARD" && !phone) {
    throw new AppError("MOBILE_MONEY_NUMBER_REQUIRED", "Le numéro Mobile Money est obligatoire.");
  }

  const remaining = await getRemainingAmount(aidRequestId);
  if (amount > remaining) {
    throw new AppError("REPAYMENT_EXCEEDS_DUE", `Le montant (${amount}) dépasse le reste dû (${remaining} FCFA).`, { amount, remaining });
  }

  const reference = generatePaymentReference();

  // On crée la trace AVANT l'appel externe : même si l'appel échoue en cours de
  // route (timeout réseau...), on garde un enregistrement de la tentative.
  const transaction = await prisma.paymentTransaction.create({
    data: {
      reference,
      userId,
      aidRequestId,
      amount,
      operator: operatorCode,
      status: "PENDING",
    },
  });

  try {
    const response = await initiatePayment({
      amount,
      phone,
      reference,
      operatorCode,
      freeInfo: "AIFI",
    });

    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { providerTransactionId: response.reference_id, rawInitResponse: response as any },
    });

    return { transactionId: transaction.id, reference, providerStatus: response.status };
  } catch (err: any) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", rawInitResponse: { error: err.message } },
    });
    throw err;
  }
}

/**
 * Démarre le paiement de l'abonnement trimestriel AIFI+. Même mécanique que le
 * remboursement (initiatePayment + webhook), mais purpose="PREMIUM_SUBSCRIPTION"
 * et pas d'aidRequestId — le traitement du succès (handleMypvitCallback /
 * attemptStatusRecovery) bifurque sur ce champ pour savoir quoi faire.
 */
export async function startPremiumSubscriptionPayment(
  userId: string,
  operatorCode: "AIRTEL_MONEY" | "MOOV_MONEY" | "VISA_MASTERCARD",
  phone: string,
  payerName?: string
) {
  if (operatorCode !== "VISA_MASTERCARD" && !phone) {
    throw new AppError("MOBILE_MONEY_NUMBER_REQUIRED", "Le numéro Mobile Money est obligatoire.");
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const amount = settings.premiumPrice;
  const reference = generatePaymentReference();

  const transaction = await prisma.paymentTransaction.create({
    data: {
      reference,
      userId,
      amount,
      operator: operatorCode,
      status: "PENDING",
      purpose: "PREMIUM_SUBSCRIPTION",
    },
  });

  try {
    const response = await initiatePayment({
      amount,
      phone,
      reference,
      operatorCode,
      freeInfo: "AIFI PLUS",
    });

    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { providerTransactionId: response.reference_id, rawInitResponse: response as any },
    });

    return { transactionId: transaction.id, reference, providerStatus: response.status };
  } catch (err: any) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", rawInitResponse: { error: err.message } },
    });
    throw err;
  }
}

/**
 * Active/prolonge l'abonnement AIFI+ suite à un paiement réussi. Si l'abonnement
 * est encore actif (renouvellement anticipé), on prolonge à partir de la date
 * d'expiration existante plutôt que depuis aujourd'hui — pour ne pas faire
 * perdre les jours restants au client qui renouvelle en avance.
 */
export async function activatePremiumSubscription(
  userId: string,
  deps: { db?: any; recompute?: (id: string) => Promise<unknown>; notify?: typeof notifyUser } = {}
) {
  const db = deps.db ?? prisma;
  const recompute = deps.recompute ?? recomputeCeilingForUser;
  const notify = deps.notify ?? notifyUser;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const now = new Date();
  const base = user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > now ? user.premiumExpiresAt : now;
  const settings = await db.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + settings.premiumDurationDays);

  // Seule écriture critique : si elle échoue, rien n'a été prolongé, le rejeu est sans risque.
  await db.user.update({
    where: { id: userId },
    data: {
      isPremium: true,
      premiumSince: user.premiumSince ?? now,
      premiumExpiresAt: expiresAt,
    },
  });

  // À partir d'ici la prolongation est acquise. Une erreur annexe ne doit JAMAIS remonter :
  // sinon la transaction repasserait en PENDING et l'abonnement serait prolongé une seconde fois.
  try {
    await recompute(userId);
  } catch (err) {
    console.error("[premium] recalcul du plafond non effectué :", err);
  }
  try {
    await notify(userId, "premium_activated", { date: expiresAt.toISOString() });
  } catch (err) {
    console.error("[premium] notification d'activation non envoyée :", err);
  }
}

export async function getPaymentStatus(transactionId: string, userId: string) {
  const transaction = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (transaction.userId !== userId) {
    throw new AppError("ACCESS_DENIED", "Accès refusé");
  }
  return transaction;
}

/**
 * Passe une transaction de PENDING à un état final, de façon atomique.
 * Renvoie false si une autre opération (callback concurrent, job de rattrapage)
 * l'a déjà traitée : l'effet métier n'est alors jamais rejoué.
 */
async function settleTransaction(
  tx: PaymentTransaction,
  finalStatus: "SUCCESS" | "FAILED",
  extra: { rawCallback?: any; providerTransactionId?: string } = {}
): Promise<boolean> {
  const claimed = await prisma.paymentTransaction.updateMany({
    where: { id: tx.id, status: "PENDING" },
    data: { status: finalStatus, ...extra },
  });
  if (claimed.count !== 1) return false;

  try {
    if (finalStatus === "SUCCESS") {
      if (tx.purpose === "PREMIUM_SUBSCRIPTION") {
        await activatePremiumSubscription(tx.userId);
      } else if (tx.aidRequestId) {
        await recordRepayment(tx.aidRequestId, tx.amount);
      }
    } else {
      await notifyUser(tx.userId, tx.purpose === "PREMIUM_SUBSCRIPTION" ? "payment_failed_premium" : "payment_failed_repayment", {});
    }
  } catch (err) {
    // L'effet métier a échoué : on remet la transaction en PENDING pour qu'elle
    // puisse être retraitée, plutôt que de la laisser marquée payée sans effet.
    await prisma.paymentTransaction.updateMany({
      where: { id: tx.id, status: finalStatus },
      data: { status: "PENDING" },
    });
    throw err;
  }
  return true;
}

/**
 * Résout une transaction PENDING en interrogeant MyPVit (Check Status).
 * Ne crédite que sur une réponse SUCCESS ou FAILED nette ; sinon elle reste PENDING.
 */
export async function attemptStatusRecovery(transactionId: string): Promise<"resolved" | "still_pending" | "unavailable"> {
  const transaction = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== "PENDING") return "still_pending";

  const status = await checkTransactionStatus(transaction.reference, transaction.operator as OperatorCode);
  if (status === null) return "unavailable";
  if (status === "PENDING") return "still_pending";

  const applied = await settleTransaction(transaction, status, {});
  return applied ? "resolved" : "still_pending";
}

interface MypvitCallbackPayload {
  transactionId: string;
  merchantReferenceId: string;
  status: "SUCCESS" | "FAILED" | string;
  amount: number;
  code: number;
  [key: string]: any;
}

/**
 * Traite le webhook MyPVit. Le callback n'est PAS signé, donc il ne décide jamais
 * seul de l'issue d'un paiement. Il déclenche une vérification auprès de MyPVit :
 *  - statut confirmé par l'API Check Status : on applique ce statut ;
 *  - API indisponible : on ne fait confiance au callback que s'il vient d'une IP
 *    MyPVit explicitement autorisée (MYPVIT_WEBHOOK_ALLOWED_IPS) ;
 *  - sinon la transaction reste PENDING et le job de rattrapage réessaiera.
 */
export async function handleMypvitCallback(
  payload: MypvitCallbackPayload,
  opts: { fromAllowlistedIp: boolean }
) {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { reference: payload.merchantReferenceId },
  });
  if (!transaction) return { alreadyProcessed: false, unknown: true };
  if (transaction.status !== "PENDING") return { alreadyProcessed: true, unknown: false };

  // Garde-fou : le montant annoncé doit correspondre au montant demandé.
  if (payload.amount !== transaction.amount) {
    console.error(
      `[mypvit callback] montant incohérent pour ${transaction.reference} (reçu ${payload.amount}, attendu ${transaction.amount})`
    );
    return { alreadyProcessed: false, unknown: false, mismatch: true };
  }

  const providerStatus = await checkTransactionStatus(transaction.reference, transaction.operator as OperatorCode);

  let finalStatus: "SUCCESS" | "FAILED" | null = null;
  if (providerStatus === "SUCCESS" || providerStatus === "FAILED") {
    finalStatus = providerStatus;
  } else if (
    providerStatus === null &&
    opts.fromAllowlistedIp &&
    (payload.status === "SUCCESS" || payload.status === "FAILED")
  ) {
    finalStatus = payload.status;
  }

  if (finalStatus === null) {
    return { alreadyProcessed: false, unknown: false, pending: true };
  }

  const applied = await settleTransaction(transaction, finalStatus, {
    rawCallback: payload as any,
    providerTransactionId: payload.transactionId,
  });
  return { alreadyProcessed: !applied, unknown: false };
}

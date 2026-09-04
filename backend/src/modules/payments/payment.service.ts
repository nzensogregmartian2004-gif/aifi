import { prisma } from "../../db/client";
import { initiatePayment, generatePaymentReference, checkTransactionStatus } from "./mypvit.client";
import { recordRepayment, getRemainingAmount } from "../repayments/repayment.service";
import { notifyUser } from "../notifications/notification.service";
import { OperatorCode } from "../../config/env";
import { recomputeCeilingForUser } from "../points/points.service";

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
    throw new Error("Cette aide ne t'appartient pas");
  }
  if (!["ACCEPTED", "DISBURSED", "LATE"].includes(aidRequest.status)) {
    throw new Error("Cette aide n'est pas en attente de remboursement");
  }
  if (!amount || amount <= 0) {
    throw new Error("Le montant doit être positif");
  }
  if (operatorCode !== "VISA_MASTERCARD" && !phone) {
    throw new Error("Le numéro Mobile Money est obligatoire.");
  }

  const remaining = await getRemainingAmount(aidRequestId);
  if (amount > remaining) {
    throw new Error(`Le montant (${amount}) dépasse le reste dû (${remaining} FCFA).`);
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
 * Démarre le paiement de l'abonnement mensuel AIFI+. Même mécanique que le
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
    throw new Error("Le numéro Mobile Money est obligatoire.");
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const amount = settings.premiumMonthlyPrice;
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
export async function activatePremiumSubscription(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();
  const base = user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > now ? user.premiumExpiresAt : now;
  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.user.update({
    where: { id: userId },
    data: {
      isPremium: true,
      premiumSince: user.premiumSince ?? now,
      premiumExpiresAt: expiresAt,
    },
  });

  await recomputeCeilingForUser(userId);

  await notifyUser(
    userId,
    "premium_activated",
    `Ton abonnement AIFI+ est actif jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}. Profite de tes avantages !`
  );
}

export async function getPaymentStatus(transactionId: string, userId: string) {
  const transaction = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (transaction.userId !== userId) {
    throw new Error("Accès refusé");
  }
  return transaction;
}

/**
 * Tente de résoudre une transaction PENDING via l'API Check Status, appelée
 * par le job de secours quand le callback n'est jamais arrivé. Idempotent :
 * si la transaction n'est plus PENDING (déjà résolue entre-temps par le
 * callback), on ne fait rien. Ne crédite QUE sur une réponse SUCCESS nette
 * (voir la prudence de checkTransactionStatus) — une réponse ambiguë laisse
 * la transaction PENDING pour que le filet de secours (notification) prenne
 * le relais.
 */
export async function attemptStatusRecovery(transactionId: string): Promise<"resolved" | "still_pending" | "unavailable"> {
  const transaction = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== "PENDING") return "still_pending";

  const status = await checkTransactionStatus(transaction.reference, transaction.operator as OperatorCode);
  if (status === null) return "unavailable";
  if (status === "PENDING") return "still_pending";

  // On revérifie juste avant d'écrire, au cas où le callback serait arrivé
  // entre-temps (évite un double traitement en cas de course).
  const fresh = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!fresh || fresh.status !== "PENDING") return "still_pending";

  if (status === "SUCCESS") {
    await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: "SUCCESS" } });
    if (transaction.purpose === "PREMIUM_SUBSCRIPTION") {
      await activatePremiumSubscription(transaction.userId);
    } else if (transaction.aidRequestId) {
      await recordRepayment(transaction.aidRequestId, transaction.amount);
    }
  } else {
    await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: "FAILED" } });
    await notifyUser(
      transaction.userId,
      "payment_failed",
      "Ton paiement Mobile Money n'a pas abouti. Tu peux réessayer ou déclarer un remboursement manuel."
    );
  }

  return "resolved";
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
 * Traite le webhook MyPVit. Idempotent : si la transaction a déjà été traitée
 * (SUCCESS/FAILED), on se contente de renvoyer l'accusé de réception sans
 * rien recréditer/rejouer.
 */
export async function handleMypvitCallback(payload: MypvitCallbackPayload) {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { reference: payload.merchantReferenceId },
  });

  if (!transaction) {
    // On ne connaît pas cette transaction — on accuse quand même réception
    // (sinon MyPVit va réessayer indéfiniment) mais on ne traite rien.
    return { alreadyProcessed: false, unknown: true };
  }

  if (transaction.status !== "PENDING") {
    // Déjà traité (rejeu du callback) : idempotence.
    return { alreadyProcessed: true, unknown: false };
  }

  // Garde-fou : le montant confirmé par MyPVit doit correspondre à celui qu'on a demandé.
  if (payload.amount !== transaction.amount) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        rawCallback: payload as any,
        providerTransactionId: payload.transactionId,
      },
    });
    return { alreadyProcessed: false, unknown: false, mismatch: true };
  }

  if (payload.status === "SUCCESS") {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "SUCCESS", rawCallback: payload as any, providerTransactionId: payload.transactionId },
    });

    if (transaction.purpose === "PREMIUM_SUBSCRIPTION") {
      await activatePremiumSubscription(transaction.userId);
    } else if (transaction.aidRequestId) {
      await recordRepayment(transaction.aidRequestId, transaction.amount);
    }
  } else {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", rawCallback: payload as any, providerTransactionId: payload.transactionId },
    });
    await notifyUser(
      transaction.userId,
      "payment_failed",
      "Ton paiement Mobile Money n'a pas abouti. Tu peux réessayer ou déclarer un remboursement manuel."
    );
  }

  return { alreadyProcessed: false, unknown: false };
}

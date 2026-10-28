"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRepaymentPayment = startRepaymentPayment;
exports.startPremiumSubscriptionPayment = startPremiumSubscriptionPayment;
exports.activatePremiumSubscription = activatePremiumSubscription;
exports.getPaymentStatus = getPaymentStatus;
exports.attemptStatusRecovery = attemptStatusRecovery;
exports.handleMypvitCallback = handleMypvitCallback;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
const mypvit_client_1 = require("./mypvit.client");
const repayment_service_1 = require("../repayments/repayment.service");
const notification_service_1 = require("../notifications/notification.service");
const points_service_1 = require("../points/points.service");
// Le message d'échec doit rester cohérent avec ce qui a réellement échoué :
// "déclarer un remboursement manuel" n'a aucun sens pour un abonnement AIFI+.
function paymentFailedMessage(purpose) {
    return purpose === "PREMIUM_SUBSCRIPTION"
        ? "Ton paiement pour l'abonnement AIFI+ n'a pas abouti. Tu peux réessayer depuis l'écran AIFI+."
        : "Ton paiement Mobile Money n'a pas abouti. Tu peux réessayer ou déclarer un remboursement manuel.";
}
async function startRepaymentPayment(userId, aidRequestId, amount, operatorCode, phone, payerName) {
    const aidRequest = await client_1.prisma.aidRequest.findUniqueOrThrow({ where: { id: aidRequestId } });
    if (aidRequest.userId !== userId) {
        throw new errors_1.AppError("AID_NOT_OWNED", "Cette aide ne t'appartient pas");
    }
    if (!["ACCEPTED", "DISBURSED", "LATE"].includes(aidRequest.status)) {
        throw new errors_1.AppError("AID_NOT_REPAYABLE", "Cette aide n'est pas en attente de remboursement");
    }
    if (!amount || amount <= 0) {
        throw new errors_1.AppError("AMOUNT_NOT_POSITIVE", "Le montant doit être positif");
    }
    if (operatorCode !== "VISA_MASTERCARD" && !phone) {
        throw new errors_1.AppError("MOBILE_MONEY_NUMBER_REQUIRED", "Le numéro Mobile Money est obligatoire.");
    }
    const remaining = await (0, repayment_service_1.getRemainingAmount)(aidRequestId);
    if (amount > remaining) {
        throw new errors_1.AppError("REPAYMENT_EXCEEDS_DUE", `Le montant (${amount}) dépasse le reste dû (${remaining} FCFA).`, { amount, remaining });
    }
    const reference = (0, mypvit_client_1.generatePaymentReference)();
    // On crée la trace AVANT l'appel externe : même si l'appel échoue en cours de
    // route (timeout réseau...), on garde un enregistrement de la tentative.
    const transaction = await client_1.prisma.paymentTransaction.create({
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
        const response = await (0, mypvit_client_1.initiatePayment)({
            amount,
            phone,
            reference,
            operatorCode,
            freeInfo: "AIFI",
        });
        await client_1.prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data: { providerTransactionId: response.reference_id, rawInitResponse: response },
        });
        return { transactionId: transaction.id, reference, providerStatus: response.status };
    }
    catch (err) {
        await client_1.prisma.paymentTransaction.update({
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
async function startPremiumSubscriptionPayment(userId, operatorCode, phone, payerName) {
    if (operatorCode !== "VISA_MASTERCARD" && !phone) {
        throw new errors_1.AppError("MOBILE_MONEY_NUMBER_REQUIRED", "Le numéro Mobile Money est obligatoire.");
    }
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    const amount = settings.premiumPrice;
    const reference = (0, mypvit_client_1.generatePaymentReference)();
    const transaction = await client_1.prisma.paymentTransaction.create({
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
        const response = await (0, mypvit_client_1.initiatePayment)({
            amount,
            phone,
            reference,
            operatorCode,
            freeInfo: "AIFI PLUS",
        });
        await client_1.prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data: { providerTransactionId: response.reference_id, rawInitResponse: response },
        });
        return { transactionId: transaction.id, reference, providerStatus: response.status };
    }
    catch (err) {
        await client_1.prisma.paymentTransaction.update({
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
async function activatePremiumSubscription(userId) {
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const now = new Date();
    const base = user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > now ? user.premiumExpiresAt : now;
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + settings.premiumDurationDays);
    await client_1.prisma.user.update({
        where: { id: userId },
        data: {
            isPremium: true,
            premiumSince: user.premiumSince ?? now,
            premiumExpiresAt: expiresAt,
        },
    });
    await (0, points_service_1.recomputeCeilingForUser)(userId);
    await (0, notification_service_1.notifyUser)(userId, "premium_activated", { date: expiresAt.toISOString() });
}
async function getPaymentStatus(transactionId, userId) {
    const transaction = await client_1.prisma.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (transaction.userId !== userId) {
        throw new errors_1.AppError("ACCESS_DENIED", "Accès refusé");
    }
    return transaction;
}
/**
 * Passe une transaction de PENDING à un état final, de façon atomique.
 * Renvoie false si une autre opération (callback concurrent, job de rattrapage)
 * l'a déjà traitée : l'effet métier n'est alors jamais rejoué.
 */
async function settleTransaction(tx, finalStatus, extra = {}) {
    const claimed = await client_1.prisma.paymentTransaction.updateMany({
        where: { id: tx.id, status: "PENDING" },
        data: { status: finalStatus, ...extra },
    });
    if (claimed.count !== 1)
        return false;
    try {
        if (finalStatus === "SUCCESS") {
            if (tx.purpose === "PREMIUM_SUBSCRIPTION") {
                await activatePremiumSubscription(tx.userId);
            }
            else if (tx.aidRequestId) {
                await (0, repayment_service_1.recordRepayment)(tx.aidRequestId, tx.amount);
            }
        }
        else {
            await (0, notification_service_1.notifyUser)(tx.userId, tx.purpose === "PREMIUM_SUBSCRIPTION" ? "payment_failed_premium" : "payment_failed_repayment", {});
        }
    }
    catch (err) {
        // L'effet métier a échoué : on remet la transaction en PENDING pour qu'elle
        // puisse être retraitée, plutôt que de la laisser marquée payée sans effet.
        await client_1.prisma.paymentTransaction.updateMany({
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
async function attemptStatusRecovery(transactionId) {
    const transaction = await client_1.prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction || transaction.status !== "PENDING")
        return "still_pending";
    const status = await (0, mypvit_client_1.checkTransactionStatus)(transaction.reference, transaction.operator);
    if (status === null)
        return "unavailable";
    if (status === "PENDING")
        return "still_pending";
    const applied = await settleTransaction(transaction, status, {});
    return applied ? "resolved" : "still_pending";
}
/**
 * Traite le webhook MyPVit. Le callback n'est PAS signé, donc il ne décide jamais
 * seul de l'issue d'un paiement. Il déclenche une vérification auprès de MyPVit :
 *  - statut confirmé par l'API Check Status : on applique ce statut ;
 *  - API indisponible : on ne fait confiance au callback que s'il vient d'une IP
 *    MyPVit explicitement autorisée (MYPVIT_WEBHOOK_ALLOWED_IPS) ;
 *  - sinon la transaction reste PENDING et le job de rattrapage réessaiera.
 */
async function handleMypvitCallback(payload, opts) {
    const transaction = await client_1.prisma.paymentTransaction.findUnique({
        where: { reference: payload.merchantReferenceId },
    });
    if (!transaction)
        return { alreadyProcessed: false, unknown: true };
    if (transaction.status !== "PENDING")
        return { alreadyProcessed: true, unknown: false };
    // Garde-fou : le montant annoncé doit correspondre au montant demandé.
    if (payload.amount !== transaction.amount) {
        console.error(`[mypvit callback] montant incohérent pour ${transaction.reference} (reçu ${payload.amount}, attendu ${transaction.amount})`);
        return { alreadyProcessed: false, unknown: false, mismatch: true };
    }
    const providerStatus = await (0, mypvit_client_1.checkTransactionStatus)(transaction.reference, transaction.operator);
    let finalStatus = null;
    if (providerStatus === "SUCCESS" || providerStatus === "FAILED") {
        finalStatus = providerStatus;
    }
    else if (providerStatus === null &&
        opts.fromAllowlistedIp &&
        (payload.status === "SUCCESS" || payload.status === "FAILED")) {
        finalStatus = payload.status;
    }
    if (finalStatus === null) {
        return { alreadyProcessed: false, unknown: false, pending: true };
    }
    const applied = await settleTransaction(transaction, finalStatus, {
        rawCallback: payload,
        providerTransactionId: payload.transactionId,
    });
    return { alreadyProcessed: !applied, unknown: false };
}

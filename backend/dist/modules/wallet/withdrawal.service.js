"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestWithdrawal = requestWithdrawal;
exports.approveWithdrawal = approveWithdrawal;
exports.approveWithdrawalViaMypvit = approveWithdrawalViaMypvit;
exports.rejectWithdrawal = rejectWithdrawal;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
const wallet_service_1 = require("./wallet.service");
const notification_service_1 = require("../notifications/notification.service");
const audit_service_1 = require("../audit/audit.service");
const mypvit_client_1 = require("../payments/mypvit.client");
async function requestWithdrawal(userId, amount, receivingOperator, receivingPhone, receivingName) {
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    if (amount < settings.minWithdrawal) {
        throw new errors_1.AppError("MIN_WITHDRAWAL", `Montant minimum de retrait : ${settings.minWithdrawal} FCFA`, { amount: settings.minWithdrawal });
    }
    if (!receivingOperator || !receivingPhone || !receivingName) {
        throw new errors_1.AppError("RECEIVING_INFO_REQUIRED", "L'opérateur, le numéro et le nom du compte de réception sont obligatoires.");
    }
    const balance = await (0, wallet_service_1.getWalletBalance)(userId);
    if (amount > balance) {
        throw new errors_1.AppError("INSUFFICIENT_BALANCE", `Solde insuffisant (disponible : ${balance} FCFA)`, { available: balance });
    }
    const withdrawal = await client_1.prisma.withdrawal.create({
        data: { userId, amount, receivingOperator, receivingPhone, receivingName, status: "PENDING" },
    });
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await (0, notification_service_1.notifyAdmins)("admin_withdrawal_requested", { name: user.name, amount });
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
async function approveWithdrawal(withdrawalId, adminId, proofImageUrl) {
    if (!proofImageUrl) {
        throw new errors_1.AppError("PROOF_REQUIRED", "Un justificatif (image) est requis pour approuver un retrait");
    }
    let result;
    try {
        result = await client_1.prisma.$transaction(async (tx) => {
            const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
            if (withdrawal.status !== "PENDING") {
                throw new errors_1.AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
            }
            const entries = await tx.walletEntry.findMany({ where: { userId: withdrawal.userId } });
            const balance = entries.reduce((sum, e) => sum + e.amount, 0);
            if (withdrawal.amount > balance) {
                throw new errors_1.AppError("INSUFFICIENT_BALANCE", `Solde insuffisant pour approuver ce retrait (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA). Le solde a dû changer depuis la demande.`, { requested: withdrawal.amount, available: balance });
            }
            const locked = await tx.withdrawal.updateMany({
                where: { id: withdrawalId, status: "PENDING" },
                data: { status: "APPROVED", proofImageUrl },
            });
            if (locked.count === 0) {
                throw new errors_1.AppError("ALREADY_TAKEN", "Ce retrait vient d'être traité par quelqu'un d'autre.");
            }
            await tx.walletEntry.create({
                data: { userId: withdrawal.userId, amount: -withdrawal.amount, reason: "withdrawal_approved" },
            });
            return tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
        }, { isolationLevel: "Serializable" });
    }
    catch (err) {
        if (err?.code === "P2034") {
            throw new errors_1.AppError("CONCURRENT_OPERATION", "Conflit avec une autre opération en cours sur ce compte — réessaie dans un instant.");
        }
        throw err;
    }
    await (0, audit_service_1.logAction)({
        adminId,
        action: "withdrawal_approve",
        entityType: "Withdrawal",
        entityId: withdrawalId,
        before: { status: "PENDING" },
        after: { status: "APPROVED", amount: result.amount },
    });
    await (0, notification_service_1.notifyUser)(result.userId, "withdrawal_approved", { amount: result.amount });
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
async function approveWithdrawalViaMypvit(withdrawalId, adminId) {
    const withdrawal = await client_1.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { user: true } });
    if (withdrawal.status !== "PENDING") {
        throw new errors_1.AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${withdrawal.status})`);
    }
    if (!withdrawal.receivingOperator || !withdrawal.receivingPhone) {
        throw new errors_1.AppError("NO_RECEIVING_INFO", "Ce retrait n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
    }
    try {
        await client_1.prisma.$transaction(async (tx) => {
            const entries = await tx.walletEntry.findMany({ where: { userId: withdrawal.userId } });
            const balance = entries.reduce((sum, e) => sum + e.amount, 0);
            if (withdrawal.amount > balance) {
                throw new errors_1.AppError("INSUFFICIENT_BALANCE", `Solde insuffisant (demandé : ${withdrawal.amount} FCFA, disponible : ${balance} FCFA).`, { requested: withdrawal.amount, available: balance });
            }
            const locked = await tx.withdrawal.updateMany({
                where: { id: withdrawalId, status: "PENDING" },
                data: { status: "APPROVING" },
            });
            if (locked.count === 0) {
                throw new errors_1.AppError("DISBURSE_IN_PROGRESS", "Ce retrait est déjà en cours ou a déjà été traité par quelqu'un d'autre.");
            }
            await tx.walletEntry.create({
                data: { userId: withdrawal.userId, amount: -withdrawal.amount, reason: "withdrawal_approved" },
            });
        }, { isolationLevel: "Serializable" });
    }
    catch (err) {
        if (err?.code === "P2034") {
            throw new errors_1.AppError("CONCURRENT_OPERATION", "Conflit avec une autre opération en cours sur ce compte — réessaie dans un instant.");
        }
        throw err;
    }
    const operatorCode = withdrawal.receivingOperator;
    const reference = (0, mypvit_client_1.generateDisbursementReference)();
    const transaction = await client_1.prisma.paymentTransaction.create({
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
    async function releaseReservation(reason) {
        await client_1.prisma.$transaction([
            client_1.prisma.withdrawal.update({ where: { id: withdrawalId }, data: { status: "PENDING" } }),
            client_1.prisma.walletEntry.create({
                data: { userId: withdrawal.userId, amount: withdrawal.amount, reason },
            }),
        ]);
    }
    let result;
    try {
        result = await (0, mypvit_client_1.giveChange)({
            amount: withdrawal.amount,
            phone: withdrawal.receivingPhone,
            reference,
            operatorCode,
            freeInfo: "AIFI",
        });
    }
    catch (err) {
        await client_1.prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data: { status: "FAILED", rawInitResponse: { error: err.message } },
        });
        await releaseReservation("withdrawal_retry_after_error");
        throw new errors_1.AppError("PAYOUT_FAILED", `Le retrait automatique a échoué : ${err.message}`);
    }
    const success = result.status === "SUCCESS";
    await client_1.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: success ? "SUCCESS" : "FAILED", providerTransactionId: result.reference_id, rawInitResponse: result },
    });
    if (!success) {
        await releaseReservation("withdrawal_retry_after_rejection");
        throw new errors_1.AppError("PAYOUT_FAILED", result.message || "Le retrait a été refusé par l'opérateur.");
    }
    const updated = await client_1.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: "APPROVED" },
    });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "withdrawal_approve_auto",
        entityType: "Withdrawal",
        entityId: withdrawalId,
        before: { status: "PENDING" },
        after: { status: "APPROVED", amount: updated.amount, reference, operator: operatorCode },
    });
    await (0, notification_service_1.notifyUser)(updated.userId, "withdrawal_approved_auto", { amount: updated.amount, operator: operatorCode === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money" });
    return updated;
}
async function rejectWithdrawal(withdrawalId, adminId) {
    const existing = await client_1.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    if (existing.status !== "PENDING") {
        throw new errors_1.AppError("ALREADY_PROCESSED", `Ce retrait a déjà été traité (statut actuel : ${existing.status})`);
    }
    const locked = await client_1.prisma.withdrawal.updateMany({
        where: { id: withdrawalId, status: "PENDING" },
        data: { status: "REJECTED" },
    });
    if (locked.count === 0) {
        throw new errors_1.AppError("ALREADY_TAKEN", "Ce retrait a déjà été traité par quelqu'un d'autre.");
    }
    const withdrawal = await client_1.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "withdrawal_reject",
        entityType: "Withdrawal",
        entityId: withdrawalId,
        before: { status: "PENDING" },
        after: { status: "REJECTED" },
    });
    await (0, notification_service_1.notifyUser)(withdrawal.userId, "withdrawal_rejected", { amount: withdrawal.amount });
    return withdrawal;
}

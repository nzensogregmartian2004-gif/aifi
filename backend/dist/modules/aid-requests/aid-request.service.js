"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAvailableCeiling = computeAvailableCeiling;
exports.getAvailableCeiling = getAvailableCeiling;
exports.quoteAidRequest = quoteAidRequest;
exports.requestAid = requestAid;
exports.acceptAidRequest = acceptAidRequest;
exports.rejectAidRequest = rejectAidRequest;
exports.disburseAidRequest = disburseAidRequest;
exports.disburseAidRequestViaMypvit = disburseAidRequestViaMypvit;
const errors_1 = require("../../errors");
const rules_1 = require("../finance/rules");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notifications/notification.service");
const audit_service_1 = require("../audit/audit.service");
const mypvit_client_1 = require("../payments/mypvit.client");
const duration_tier_service_1 = require("../durations/duration-tier.service");
/**
 * Plafond disponible = plafond du client moins le capital encore dû sur toutes
 * ses demandes engagées. Les demandes EN ATTENTE comptent déjà : sinon un client
 * pouvait en envoyer plusieurs, chacune sous le plafond, puis les faire accepter.
 */
async function computeAvailableCeiling(db, userId) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const openRequests = await db.aidRequest.findMany({
        where: { userId, status: { in: ["PENDING", "ACCEPTED", "DISBURSED", "LATE"] } },
        include: { repayments: true },
    });
    return (0, rules_1.availableCeiling)(user.ceiling, openRequests.map((r) => ({
        amount: r.amount,
        repaid: r.repayments.reduce((s, rep) => s + rep.amount, 0),
    })));
}
async function getAvailableCeiling(userId) {
    return computeAvailableCeiling(client_1.prisma, userId);
}
/**
 * Conditions d'une demande, calculées ici pour le devis ET pour la création : ce qui
 * est affiché au client est exactement ce qui sera enregistré.
 * - Par défaut : durée et montant de la grille (fixés à la date de la demande).
 * - À partir de flexibleDueMinPoints points : durée choisie, montant recalculé à
 *   partir des intérêts de la grille ; maximum = double de la grille.
 * - Le sursis (graceDays) est figé à la demande.
 */
async function computeRequestTerms(userId, amount, requestedDurationDays) {
    if (!amount || amount <= 0) {
        throw new errors_1.AppError("AMOUNT_NOT_POSITIVE", "Le montant demandé doit être positif");
    }
    const requester = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    const { tierAmount, durationDays: gridDurationDays } = await (0, duration_tier_service_1.computeDurationForAmount)(amount);
    // Le taux ET la durée sont figés à la date de la demande : les modifier plus
    // tard dans les paramètres n'affecte jamais une demande déjà créée.
    const feePercent = requester.isPremium ? settings.premiumServiceFeePercent : settings.serviceFeePercent;
    const gridAmountDue = Math.round(amount * (1 + feePercent / 100));
    const interestAmount = gridAmountDue - amount;
    const chosenDurationDays = requestedDurationDays ?? gridDurationDays;
    (0, rules_1.assertDueChoice)({
        chosenDurationDays,
        gridDurationDays,
        points: requester.points,
        minPoints: settings.flexibleDueMinPoints,
        minDays: settings.flexibleDueMinDays,
    });
    const amountDue = (0, rules_1.flexibleAmountDue)(amount, gridAmountDue, gridDurationDays, chosenDurationDays);
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
async function quoteAidRequest(userId, amount, requestedDurationDays) {
    const terms = await computeRequestTerms(userId, amount, requestedDurationDays);
    const range = (0, rules_1.dueDateChoiceRange)(terms.gridDurationDays, terms.settings.flexibleDueMinDays);
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
async function requestAid(userId, amount, receivingOperator, receivingPhone, receivingName, requestedDurationDays) {
    if (!receivingOperator || !receivingPhone || !receivingName) {
        throw new errors_1.AppError("RECEIVING_INFO_REQUIRED", "L'opérateur, le numéro et le nom du compte de réception sont obligatoires.");
    }
    const requester = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (requester.status !== "ACTIVE") {
        throw new errors_1.AppError("ACCOUNT_NOT_ACTIVE", "Ton compte doit d'abord être validé par un administrateur avant de pouvoir demander une aide.");
    }
    const terms = await computeRequestTerms(userId, amount, requestedDurationDays);
    // Contrôle du plafond ET création dans une même transaction Serializable :
    // deux demandes simultanées ne peuvent plus lire le même plafond libre.
    let request;
    try {
        request = await client_1.prisma.$transaction(async (tx) => {
            const available = await computeAvailableCeiling(tx, userId);
            if (amount > available) {
                throw new errors_1.AppError("CEILING_EXCEEDED", `Montant demandé (${amount}) dépasse le plafond disponible (${available})`, { amount, available });
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
        }, { isolationLevel: "Serializable" });
    }
    catch (err) {
        if (err?.code === "P2034") {
            throw new errors_1.AppError("CONCURRENT_OPERATION", "Une autre demande est en cours de traitement. Réessaie dans un instant.");
        }
        throw err;
    }
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await (0, notification_service_1.notifyAdmins)("admin_aid_request_created", { name: user.name, amount }, request.id);
    return request;
}
async function acceptAidRequest(id, adminId) {
    // Le plafond est revérifié à l'acceptation : il a pu changer depuis la demande
    // (points, début ou fin d'AIFI+, réglage admin). Tout se passe dans une
    // transaction Serializable : une seule acceptation concurrente peut passer.
    let outcome;
    try {
        outcome = await client_1.prisma.$transaction(async (tx) => {
            const existing = await tx.aidRequest.findUniqueOrThrow({ where: { id } });
            if (existing.status !== "PENDING") {
                throw new errors_1.AppError("ALREADY_PROCESSED", `Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
            }
            const available = await computeAvailableCeiling(tx, existing.userId);
            if (available < 0) {
                throw new errors_1.AppError("CEILING_OVER", `Plafond dépassé pour ce client (${-available} FCFA au-dessus). Refuse la demande ou ajuste le plafond avant d'accepter.`, { excess: -available });
            }
            const locked = await tx.aidRequest.updateMany({
                where: { id, status: "PENDING" },
                data: { status: "ACCEPTED" },
            });
            if (locked.count === 0) {
                throw new errors_1.AppError("ALREADY_TAKEN", "Cette demande vient d'être traitée par quelqu'un d'autre.");
            }
            const request = await tx.aidRequest.findUniqueOrThrow({ where: { id } });
            return { existing, request };
        }, { isolationLevel: "Serializable" });
    }
    catch (err) {
        if (err?.code === "P2034") {
            throw new errors_1.AppError("CONCURRENT_OPERATION", "Conflit avec une autre opération sur ce client — réessaie dans un instant.");
        }
        throw err;
    }
    const { existing, request } = outcome;
    await (0, audit_service_1.logAction)({
        adminId,
        action: "aid_request_accept",
        entityType: "AidRequest",
        entityId: id,
        before: { status: existing.status },
        after: { status: request.status },
    });
    await (0, notification_service_1.notifyUser)(request.userId, "aid_request_accepted", { amount: request.amount, dueDate: request.dueDate ? request.dueDate.toISOString() : "" }, request.id);
    return request;
}
async function rejectAidRequest(id, adminId) {
    const existing = await client_1.prisma.aidRequest.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "PENDING") {
        throw new errors_1.AppError("ALREADY_PROCESSED", `Cette demande a déjà été traitée (statut actuel : ${existing.status})`);
    }
    const request = await client_1.prisma.aidRequest.update({ where: { id }, data: { status: "REJECTED" } });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "aid_request_reject",
        entityType: "AidRequest",
        entityId: id,
        before: { status: existing.status },
        after: { status: request.status },
    });
    await (0, notification_service_1.notifyUser)(request.userId, "aid_request_rejected", { amount: request.amount }, request.id);
    return request;
}
async function disburseAidRequest(id, adminId, note) {
    const existing = await client_1.prisma.aidRequest.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "ACCEPTED") {
        throw new errors_1.AppError("DISBURSE_NOT_ACCEPTED", `Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
    }
    // Même verrou atomique que la voie MyPVit (§ci-dessous) : évite deux
    // marquages "envoyé" en double (deux notifications, deux logs d'audit) sur
    // un double-clic ou deux admins simultanés.
    const locked = await client_1.prisma.aidRequest.updateMany({
        where: { id, status: "ACCEPTED" },
        data: { status: "DISBURSED" },
    });
    if (locked.count === 0) {
        throw new errors_1.AppError("ALREADY_TAKEN", "Cette demande a déjà été traitée par quelqu'un d'autre.");
    }
    const request = await client_1.prisma.aidRequest.findUniqueOrThrow({ where: { id } });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "aid_request_disburse_manual",
        entityType: "AidRequest",
        entityId: id,
        before: { status: existing.status },
        after: { status: request.status },
        note,
    });
    await (0, notification_service_1.notifyUser)(request.userId, "aid_request_disbursed", { amount: request.amount }, request.id);
    return request;
}
/**
 * Décaissement automatique via MyPVit (GIVE_CHANGE, synchrone : le statut
 * final est dans la réponse, pas besoin d'attendre un webhook). Envoie
 * toujours vers l'opérateur et le numéro choisis par le CLIENT lui-même à sa
 * demande (jamais un choix de l'admin). En cas d'échec, la demande reste
 * "ACCEPTED" — l'admin peut réessayer ou basculer sur l'envoi manuel
 * (disburseAidRequest ci-dessus).
 */
async function disburseAidRequestViaMypvit(id, adminId) {
    const existing = await client_1.prisma.aidRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (existing.status !== "ACCEPTED") {
        throw new errors_1.AppError("DISBURSE_NOT_ACCEPTED", `Impossible d'envoyer les fonds : statut actuel "${existing.status}" (doit être ACCEPTED)`);
    }
    if (!existing.receivingOperator || !existing.receivingPhone) {
        throw new errors_1.AppError("NO_RECEIVING_INFO", "Cette demande n'a pas d'opérateur/numéro de réception enregistré — utilise l'envoi manuel.");
    }
    // Verrou atomique : ne fait passer ACCEPTED -> DISBURSING que pour UN seul
    // appelant. Si deux admins (ou un double-clic / une requête réseau rejouée)
    // déclenchent l'envoi en même temps, un seul obtient le verrou ; l'autre est
    // rejeté avant même d'appeler MyPVit — ça évite un envoi d'argent en double.
    const locked = await client_1.prisma.aidRequest.updateMany({
        where: { id, status: "ACCEPTED" },
        data: { status: "DISBURSING" },
    });
    if (locked.count === 0) {
        throw new errors_1.AppError("DISBURSE_IN_PROGRESS", "Ce décaissement est déjà en cours ou a déjà été traité par quelqu'un d'autre.");
    }
    const reference = (0, mypvit_client_1.generateDisbursementReference)();
    const transaction = await client_1.prisma.paymentTransaction.create({
        data: {
            reference,
            userId: existing.userId,
            aidRequestId: existing.id,
            amount: existing.amount,
            operator: existing.receivingOperator,
            status: "PENDING",
        },
    });
    let result;
    try {
        result = await (0, mypvit_client_1.giveChange)({
            amount: existing.amount,
            phone: existing.receivingPhone,
            reference,
            operatorCode: existing.receivingOperator,
            freeInfo: "AIFI",
        });
    }
    catch (err) {
        await client_1.prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data: { status: "FAILED", rawInitResponse: { error: err.message } },
        });
        // On relâche le verrou (retour à ACCEPTED) pour que l'admin puisse
        // réessayer — sinon la demande resterait bloquée en DISBURSING pour
        // toujours après un simple échec réseau.
        await client_1.prisma.aidRequest.update({ where: { id }, data: { status: "ACCEPTED" } });
        throw new errors_1.AppError("PAYOUT_FAILED", `Le décaissement automatique a échoué : ${err.message}`);
    }
    const success = result.status === "SUCCESS";
    await client_1.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: success ? "SUCCESS" : "FAILED", providerTransactionId: result.reference_id, rawInitResponse: result },
    });
    if (!success) {
        // Idem : refus net de l'opérateur, on relâche le verrou pour permettre
        // une nouvelle tentative (ou un passage en envoi manuel).
        await client_1.prisma.aidRequest.update({ where: { id }, data: { status: "ACCEPTED" } });
        throw new errors_1.AppError("PAYOUT_FAILED", result.message || "Le décaissement a été refusé par l'opérateur.");
    }
    const request = await client_1.prisma.aidRequest.update({ where: { id }, data: { status: "DISBURSED" } });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "aid_request_disburse_auto",
        entityType: "AidRequest",
        entityId: id,
        before: { status: existing.status },
        after: { status: request.status, reference, operator: existing.receivingOperator },
    });
    await (0, notification_service_1.notifyUser)(request.userId, "aid_request_disbursed_auto", { amount: request.amount, operator: existing.receivingOperator === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money" }, request.id);
    return request;
}

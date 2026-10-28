"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listVerifications = listVerifications;
exports.getVerificationDetail = getVerificationDetail;
exports.decideVerification = decideVerification;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
const audit_service_1 = require("../audit/audit.service");
const notification_service_1 = require("../notifications/notification.service");
const account_validation_service_1 = require("../users/account-validation.service");
const USER_FIELDS = { id: true, name: true, phone: true, status: true, createdAt: true };
async function listVerifications(status) {
    return client_1.prisma.identityVerification.findMany({
        where: status ? { status } : {},
        include: { user: { select: USER_FIELDS } },
        orderBy: { createdAt: "asc" },
    });
}
async function getVerificationDetail(userId) {
    return client_1.prisma.identityVerification.findUniqueOrThrow({
        where: { userId },
        include: { user: { select: USER_FIELDS } },
    });
}
/**
 * Valide ou refuse un dossier d'identité.
 * - Validation : le dossier passe APPROVED ; si le compte est encore en attente, il est activé.
 * - Refus : motif obligatoire, visible par le client, qui peut renvoyer ses documents.
 */
async function decideVerification(adminId, userId, decision, note) {
    const current = await client_1.prisma.identityVerification.findUniqueOrThrow({ where: { userId } });
    if (current.status === "APPROVED") {
        throw new errors_1.AppError("ALREADY_VERIFIED", "Ce dossier est déjà validé.");
    }
    const trimmed = note?.trim() || "";
    if (decision === "REJECT" && !trimmed) {
        throw new errors_1.AppError("REASON_REQUIRED", "Indique le motif du refus : le client le verra.");
    }
    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await client_1.prisma.identityVerification.update({
        where: { userId },
        data: {
            status,
            reviewNote: decision === "REJECT" ? trimmed : null,
            reviewedAt: new Date(),
        },
    });
    await (0, audit_service_1.logAction)({
        adminId,
        action: decision === "APPROVE" ? "verification_approve" : "verification_reject",
        entityType: "IdentityVerification",
        entityId: updated.id,
        before: { status: current.status },
        after: { status },
        note: trimmed || undefined,
    });
    if (decision === "APPROVE") {
        const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.status === "PENDING") {
            await (0, account_validation_service_1.validateAccount)(userId, adminId);
        }
        await (0, notification_service_1.notifyUser)(userId, "verification_approved", {});
    }
    else {
        await (0, notification_service_1.notifyUser)(userId, "verification_rejected", { reason: trimmed });
    }
    return updated;
}

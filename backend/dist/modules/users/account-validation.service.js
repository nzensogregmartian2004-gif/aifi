"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAccount = validateAccount;
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
const audit_service_1 = require("../audit/audit.service");
const points_service_1 = require("../points/points.service");
const wallet_service_1 = require("../wallet/wallet.service");
const notification_service_1 = require("../notifications/notification.service");
/** Validation atomique : activation, points, bonus, portefeuille et audit sont validés ensemble. */
async function validateAccount(userId, adminId, db = client_1.prisma) {
    const result = await db.$transaction(async (tx) => {
        const locked = await tx.user.updateMany({
            where: { id: userId, status: "PENDING" },
            data: { status: "ACTIVE" },
        });
        if (locked.count !== 1) {
            throw new errors_1.AppError("ALREADY_VALIDATED", "Ce compte n'est pas en attente de validation (déjà validé ou suspendu).");
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        await (0, audit_service_1.logAction)({
            adminId, action: "user_validate", entityType: "User", entityId: user.id,
            before: { status: "PENDING" }, after: { status: "ACTIVE" },
        }, tx);
        await (0, points_service_1.addPoints)(user.id, 10, "validation_compte", tx);
        let referral = null;
        if (user.referredById) {
            const settings = await tx.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
            await (0, wallet_service_1.creditWallet)(user.referredById, settings.referralBonus, "referral_bonus", tx);
            await (0, points_service_1.addPoints)(user.referredById, settings.referralPoints, "parrainage_valide", tx);
            const sponsor = await tx.user.findUniqueOrThrow({ where: { id: user.referredById }, select: { id: true, name: true } });
            referral = { ...sponsor, bonus: settings.referralBonus, points: settings.referralPoints };
        }
        return { user, referral };
    });
    // Les notifications sont hors transaction : leur indisponibilité ne doit pas annuler les écritures financières.
    await (0, notification_service_1.notifyUser)(result.user.id, "account_validated", {}).catch(() => { });
    if (result.referral) {
        await (0, notification_service_1.notifyUser)(result.referral.id, "referral_validated", {
            name: result.referral.name, bonus: result.referral.bonus, points: result.referral.points,
        }).catch(() => { });
    }
    return result.user;
}

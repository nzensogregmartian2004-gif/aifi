"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAccount = validateAccount;
const client_1 = require("../../db/client");
const audit_service_1 = require("../audit/audit.service");
const points_service_1 = require("../points/points.service");
const wallet_service_1 = require("../wallet/wallet.service");
const notification_service_1 = require("../notifications/notification.service");
/**
 * Valide un compte en attente : statut ACTIVE, points de validation,
 * bonus de parrainage si le compte a été parrainé, notification au client.
 * Utilisé par la validation manuelle et par la validation d'un dossier d'identité.
 */
async function validateAccount(userId, adminId) {
    const user = await client_1.prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
    });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "user_validate",
        entityType: "User",
        entityId: user.id,
        before: { status: "PENDING" },
        after: { status: "ACTIVE" },
    });
    await (0, points_service_1.addPoints)(user.id, 10, "validation_compte");
    if (user.referredById) {
        const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
        await (0, wallet_service_1.creditWallet)(user.referredById, settings.referralBonus, "referral_bonus");
        await (0, points_service_1.addPoints)(user.referredById, settings.referralPoints, "parrainage_valide");
        await (0, notification_service_1.notifyUser)(user.referredById, "referral_validated", { name: user.name, bonus: settings.referralBonus, points: settings.referralPoints });
    }
    await (0, notification_service_1.notifyUser)(user.id, "account_validated", {});
    return user;
}

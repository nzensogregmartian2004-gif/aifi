"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suspendUser = suspendUser;
exports.reactivateUser = reactivateUser;
exports.updateUserInfo = updateUserInfo;
exports.anonymizeUser = anonymizeUser;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notifications/notification.service");
const audit_service_1 = require("../audit/audit.service");
const crypto_1 = __importDefault(require("crypto"));
async function suspendUser(id, adminId, reason) {
    const user = await client_1.prisma.user.update({ where: { id }, data: { status: "SUSPENDED" } });
    await (0, audit_service_1.logAction)({ adminId, action: "user_suspend", entityType: "User", entityId: id, note: reason });
    await (0, notification_service_1.notifyUser)(user.id, reason ? "account_suspended_reason" : "account_suspended", { reason: reason ?? "" });
    return user;
}
async function reactivateUser(id, adminId) {
    const user = await client_1.prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
    await (0, audit_service_1.logAction)({ adminId, action: "user_reactivate", entityType: "User", entityId: id });
    await (0, notification_service_1.notifyUser)(user.id, "account_reactivated", {});
    return user;
}
async function updateUserInfo(id, data, adminId) {
    const before = await client_1.prisma.user.findUniqueOrThrow({
        where: { id },
        select: { name: true, phone: true, points: true, ceiling: true },
    });
    const user = await client_1.prisma.user.update({ where: { id }, data });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "user_update_info",
        entityType: "User",
        entityId: id,
        before,
        after: { name: user.name, phone: user.phone, points: user.points, ceiling: user.ceiling },
    });
    return user;
}
/**
 * "Suppression" d'un compte = anonymisation, pas de suppression réelle en base.
 * L'historique financier (demandes d'aide, remboursements, retraits, parrainages)
 * est conservé pour l'intégrité comptable, mais les données personnelles
 * (nom, téléphone) sont effacées et remplacées. Le compte devient inutilisable
 * (mot de passe aléatoire, téléphone remplacé) et ne peut plus se connecter.
 * Action irréversible.
 */
async function anonymizeUser(id, adminId) {
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.anonymizedAt) {
        throw new errors_1.AppError("ALREADY_ANONYMIZED", "Ce compte est déjà anonymisé");
    }
    const suffix = crypto_1.default.randomBytes(6).toString("hex");
    const randomPasswordHash = crypto_1.default.randomBytes(32).toString("hex"); // non utilisable, ne matchera jamais un mot de passe réel
    const updated = await client_1.prisma.user.update({
        where: { id },
        data: {
            name: "Utilisateur supprimé",
            phone: `supprime_${suffix}`,
            referralCode: `DEL_${suffix.toUpperCase()}`,
            passwordHash: randomPasswordHash,
            status: "SUSPENDED",
            anonymizedAt: new Date(),
        },
    });
    await (0, audit_service_1.logAction)({
        adminId,
        action: "user_anonymize",
        entityType: "User",
        entityId: id,
        before: { name: user.name, phone: user.phone },
        note: "Anonymisation irréversible",
    });
    return updated;
}

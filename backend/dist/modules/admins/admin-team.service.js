"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_AUDIT_ACTIONS = void 0;
exports.createAdmin = createAdmin;
exports.setSuperAdmin = setSuperAdmin;
exports.setAdminStatus = setAdminStatus;
exports.resetAdminPassword = resetAdminPassword;
exports.listAdmins = listAdmins;
exports.listAdminAudit = listAdminAudit;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
const phone_owner_1 = require("../users/phone-owner");
/**
 * Gestion de l'équipe administrateur. Toutes les opérations écrivent dans le journal d'audit.
 * Garde-fous : on ne peut pas modifier ses propres droits ni se suspendre, et il doit toujours
 * rester au moins un super administrateur actif. Les paramètres `db` servent aux tests.
 */
exports.ADMIN_AUDIT_ACTIONS = [
    "admin_created",
    "admin_super_granted",
    "admin_super_revoked",
    "admin_suspended",
    "admin_reactivated",
    "admin_password_reset",
];
function newReferralCode() {
    return crypto_1.default.randomBytes(5).toString("hex").toUpperCase();
}
async function getAdmin(db, id) {
    const admin = await db.user.findUnique({ where: { id } });
    if (!admin || admin.role !== "ADMIN") {
        throw new errors_1.AppError("NOT_AN_ADMIN", "Ce compte n'est pas un administrateur.");
    }
    return admin;
}
async function countActiveSuperAdmins(db) {
    return db.user.count({ where: { role: "ADMIN", isSuperAdmin: true, status: "ACTIVE" } });
}
async function audit(db, adminId, action, entityId, after) {
    await db.auditLog.create({ data: { adminId, action, entityType: "User", entityId, after } });
}
/** Crée directement un compte administrateur actif (sans parcours client ni message de bienvenue). */
async function createAdmin(actorId, input, db = client_1.prisma) {
    if (!input.password || input.password.length < 8) {
        throw new errors_1.AppError("PASSWORD_TOO_SHORT", "Le mot de passe doit contenir au moins 8 caractères");
    }
    await (0, phone_owner_1.assertPhoneAvailable)(db, input.phone, { revealOwner: true });
    const passwordHash = await bcrypt_1.default.hash(input.password, 10);
    let referralCode = newReferralCode();
    while (await db.user.findUnique({ where: { referralCode } }))
        referralCode = newReferralCode();
    const admin = await db.user.create({
        data: {
            name: input.name,
            phone: input.phone,
            passwordHash,
            referralCode,
            role: "ADMIN",
            status: "ACTIVE",
            isSuperAdmin: false,
        },
    });
    await audit(db, actorId, "admin_created", admin.id, { name: admin.name, phone: admin.phone });
    return { id: admin.id, name: admin.name, phone: admin.phone };
}
/** Accorde ou retire le statut de super administrateur. */
async function setSuperAdmin(actorId, targetId, isSuperAdmin, db = client_1.prisma) {
    if (actorId === targetId) {
        throw new errors_1.AppError("SELF_ACTION_FORBIDDEN", "Tu ne peux pas modifier tes propres droits de super administrateur.");
    }
    const target = await getAdmin(db, targetId);
    if (target.isSuperAdmin === isSuperAdmin) {
        return { id: target.id, name: target.name, isSuperAdmin: target.isSuperAdmin };
    }
    if (!isSuperAdmin && target.status === "ACTIVE" && (await countActiveSuperAdmins(db)) <= 1) {
        throw new errors_1.AppError("LAST_SUPER_ADMIN", "Il doit toujours rester au moins un super administrateur actif.");
    }
    const updated = await db.user.update({ where: { id: targetId }, data: { isSuperAdmin } });
    await audit(db, actorId, isSuperAdmin ? "admin_super_granted" : "admin_super_revoked", targetId, { name: target.name });
    return { id: updated.id, name: updated.name, isSuperAdmin: updated.isSuperAdmin };
}
/** Suspend ou réactive un administrateur. Suspendre révoque immédiatement ses sessions. */
async function setAdminStatus(actorId, targetId, status, db = client_1.prisma) {
    if (actorId === targetId) {
        throw new errors_1.AppError("SELF_ACTION_FORBIDDEN", "Tu ne peux pas suspendre ton propre compte.");
    }
    const target = await getAdmin(db, targetId);
    if (target.status === status) {
        return { id: target.id, name: target.name, status: target.status };
    }
    if (status === "SUSPENDED" &&
        target.isSuperAdmin &&
        target.status === "ACTIVE" &&
        (await countActiveSuperAdmins(db)) <= 1) {
        throw new errors_1.AppError("LAST_SUPER_ADMIN", "Impossible de suspendre le dernier super administrateur actif.");
    }
    const data = { status };
    if (status === "SUSPENDED")
        data.tokenVersion = { increment: 1 };
    const updated = await db.user.update({ where: { id: targetId }, data });
    await audit(db, actorId, status === "SUSPENDED" ? "admin_suspended" : "admin_reactivated", targetId, { name: target.name });
    return { id: updated.id, name: updated.name, status: updated.status };
}
/** Réinitialise le mot de passe d'un administrateur (l'ancien est invalidé, sessions révoquées). */
async function resetAdminPassword(actorId, targetId, newPassword, db = client_1.prisma) {
    if (actorId === targetId) {
        throw new errors_1.AppError("SELF_ACTION_FORBIDDEN", "Pour ton propre mot de passe, utilise « Changer le mot de passe » dans ton profil.");
    }
    const target = await getAdmin(db, targetId);
    if (!newPassword || newPassword.length < 8) {
        throw new errors_1.AppError("PASSWORD_TOO_SHORT", "Le nouveau mot de passe doit contenir au moins 8 caractères");
    }
    const passwordHash = await bcrypt_1.default.hash(newPassword, 10);
    await db.user.update({ where: { id: targetId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    await audit(db, actorId, "admin_password_reset", targetId, { name: target.name });
    return { success: true };
}
async function listAdmins(db = client_1.prisma) {
    return db.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true, name: true, phone: true, status: true, isSuperAdmin: true, createdAt: true, lastSeenAt: true },
        orderBy: { createdAt: "asc" },
    });
}
/** Journal des actions sur les administrateurs (les plus récentes d'abord). */
async function listAdminAudit(db = client_1.prisma, take = 50) {
    return db.auditLog.findMany({
        where: { entityType: "User", action: { in: [...exports.ADMIN_AUDIT_ACTIONS] } },
        include: { admin: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take,
    });
}

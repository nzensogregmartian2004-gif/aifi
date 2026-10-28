"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
exports.listAuditLogs = listAuditLogs;
const client_1 = require("../../db/client");
/**
 * Enregistre une action administrateur pour traçabilité.
 * `before`/`after` doivent rester des objets sérialisables en JSON (pas de classes Prisma brutes
 * contenant des dates non transformées si besoin — Prisma gère déjà Date -> ISO string ici).
 */
async function logAction(params) {
    const { adminId, action, entityType, entityId, before, after, note } = params;
    return client_1.prisma.auditLog.create({
        data: {
            adminId,
            action,
            entityType,
            entityId,
            before: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
            after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
            note,
        },
    });
}
async function listAuditLogs(params) {
    const { entityType, entityId, adminId, take = 100 } = params;
    return client_1.prisma.auditLog.findMany({
        where: {
            ...(entityType ? { entityType } : {}),
            ...(entityId ? { entityId } : {}),
            ...(adminId ? { adminId } : {}),
        },
        include: { admin: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        take,
    });
}

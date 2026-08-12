import { prisma } from "../../db/client";

/**
 * Enregistre une action administrateur pour traçabilité.
 * `before`/`after` doivent rester des objets sérialisables en JSON (pas de classes Prisma brutes
 * contenant des dates non transformées si besoin — Prisma gère déjà Date -> ISO string ici).
 */
export async function logAction(params: {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}) {
  const { adminId, action, entityType, entityId, before, after, note } = params;
  return prisma.auditLog.create({
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

export async function listAuditLogs(params: {
  entityType?: string;
  entityId?: string;
  adminId?: string;
  take?: number;
}) {
  const { entityType, entityId, adminId, take = 100 } = params;
  return prisma.auditLog.findMany({
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

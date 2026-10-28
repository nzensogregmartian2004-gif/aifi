"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.effectivePoints = void 0;
exports.computeCeiling = computeCeiling;
exports.recomputeAllCeilings = recomputeAllCeilings;
exports.getAllTiers = getAllTiers;
exports.upsertTier = upsertTier;
exports.deleteTier = deleteTier;
const client_1 = require("../../db/client");
const rules_1 = require("../finance/rules");
Object.defineProperty(exports, "effectivePoints", { enumerable: true, get: function () { return rules_1.effectivePoints; } });
async function computeCeiling(points, isPremium = false) {
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    const tiers = await client_1.prisma.ceilingTier.findMany({ select: { minPoints: true, ceiling: true } });
    return (0, rules_1.tierCeilingFor)((0, rules_1.effectivePoints)(points, isPremium, settings.freePointsCap), tiers);
}
/**
 * Recalcule le plafond mis en cache de tous les clients. À appeler après tout
 * changement de palier ou de règle, sinon les clients existants gardent l'ancien plafond.
 */
async function recomputeAllCeilings() {
    const users = await client_1.prisma.user.findMany({ select: { id: true, points: true, isPremium: true, ceiling: true } });
    let changed = 0;
    for (const u of users) {
        const ceiling = await computeCeiling(u.points, u.isPremium);
        if (ceiling !== u.ceiling) {
            await client_1.prisma.user.update({ where: { id: u.id }, data: { ceiling } });
            changed++;
        }
    }
    return changed;
}
async function getAllTiers() {
    return client_1.prisma.ceilingTier.findMany({ orderBy: { minPoints: "asc" } });
}
async function upsertTier(minPoints, ceiling) {
    const tier = await client_1.prisma.ceilingTier.upsert({
        where: { minPoints },
        update: { ceiling },
        create: { minPoints, ceiling },
    });
    await recomputeAllCeilings();
    return tier;
}
async function deleteTier(id) {
    const tier = await client_1.prisma.ceilingTier.delete({ where: { id } });
    await recomputeAllCeilings();
    return tier;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addPoints = addPoints;
exports.recomputeCeilingForUser = recomputeCeilingForUser;
const client_1 = require("../../db/client");
const ceiling_service_1 = require("../ceilings/ceiling.service");
async function addPoints(userId, delta, reason) {
    const user = await client_1.prisma.user.update({
        where: { id: userId },
        data: { points: { increment: delta } },
    });
    const clampedPoints = Math.max(0, user.points);
    if (clampedPoints !== user.points) {
        await client_1.prisma.user.update({ where: { id: userId }, data: { points: clampedPoints } });
    }
    const newCeiling = await (0, ceiling_service_1.computeCeiling)(clampedPoints, user.isPremium);
    if (newCeiling !== user.ceiling) {
        await client_1.prisma.user.update({ where: { id: userId }, data: { ceiling: newCeiling } });
    }
    return { points: clampedPoints, ceiling: newCeiling, reason };
}
/**
 * Recalcule immédiatement le plafond, sans passer par un changement de
 * points — utilisé quand le statut AIFI+ change (activation, expiration).
 */
async function recomputeCeilingForUser(userId) {
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ceiling = await (0, ceiling_service_1.computeCeiling)(user.points, user.isPremium);
    if (ceiling !== user.ceiling) {
        await client_1.prisma.user.update({ where: { id: userId }, data: { ceiling } });
    }
    return ceiling;
}

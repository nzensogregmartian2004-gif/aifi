"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDurationForAmount = computeDurationForAmount;
exports.getAllDurationTiers = getAllDurationTiers;
exports.upsertDurationTier = upsertDurationTier;
exports.deleteDurationTier = deleteDurationTier;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
/**
 * Le montant demandé est rattaché au palier immédiatement inférieur (le plus
 * grand minAmount <= montant). Ex : 1300 FCFA -> palier 1000 FCFA.
 * Si le montant est en dessous du plus petit palier configuré, on refuse
 * (pas de durée définie pour ce cas plutôt que d'en deviner une).
 */
async function computeDurationForAmount(amount) {
    const tier = await client_1.prisma.durationTier.findFirst({
        where: { minAmount: { lte: amount } },
        orderBy: { minAmount: "desc" },
    });
    if (!tier) {
        const smallest = await client_1.prisma.durationTier.findFirst({ orderBy: { minAmount: "asc" } });
        throw smallest
            ? new errors_1.AppError("MIN_REQUEST_AMOUNT", `Montant minimum pour une demande : ${smallest.minAmount} FCFA`, { minAmount: smallest.minAmount })
            : new errors_1.AppError("NO_DURATION_GRID", "Aucune grille de remboursement n'est configurée.");
    }
    return { tierAmount: tier.minAmount, durationDays: tier.durationDays };
}
async function getAllDurationTiers() {
    return client_1.prisma.durationTier.findMany({ orderBy: { minAmount: "asc" } });
}
async function upsertDurationTier(minAmount, durationDays) {
    return client_1.prisma.durationTier.upsert({
        where: { minAmount },
        update: { durationDays },
        create: { minAmount, durationDays },
    });
}
async function deleteDurationTier(id) {
    return client_1.prisma.durationTier.delete({ where: { id } });
}

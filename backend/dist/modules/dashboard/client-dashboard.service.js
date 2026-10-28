"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientDashboard = getClientDashboard;
const client_1 = require("../../db/client");
const ceiling_service_1 = require("../ceilings/ceiling.service");
const aid_request_service_1 = require("../aid-requests/aid-request.service");
const wallet_service_1 = require("../wallet/wallet.service");
const TRUST_LEVELS = [
    { minPoints: 240, label: "Excellent" },
    { minPoints: 150, label: "Très fiable" },
    { minPoints: 100, label: "Fiable" },
    { minPoints: 50, label: "Bon" },
    { minPoints: 20, label: "Correct" },
    { minPoints: 10, label: "Débutant" },
    { minPoints: 0, label: "Nouveau" },
];
function getTrustLevel(points) {
    return TRUST_LEVELS.find(t => points >= t.minPoints)?.label ?? "Nouveau";
}
async function getClientDashboard(userId) {
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const activeRequests = await client_1.prisma.aidRequest.findMany({
        where: { userId, status: { in: ["ACCEPTED", "DISBURSED", "LATE"] } },
        orderBy: { dueDate: "asc" },
    });
    const nextDueDate = activeRequests.find(r => r.dueDate)?.dueDate ?? null;
    const referralsCount = await client_1.prisma.user.count({ where: { referredById: userId } });
    const aidRequestsCount = await client_1.prisma.aidRequest.count({ where: { userId } });
    const walletBalance = await (0, wallet_service_1.getWalletBalance)(userId);
    const ceilingAvailable = await (0, aid_request_service_1.getAvailableCeiling)(userId);
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    // Avantage AIFI+ : +20 sur le niveau de confiance affiché. Ça ne touche
    // que l'affichage (et donc le libellé de palier) — les points réels
    // stockés, eux, restent inchangés et continuent de piloter le plafond
    // normalement (le plafond profite déjà de son propre bonus premium).
    const displayedPoints = user.isPremium ? user.points + 20 : user.points;
    return {
        name: user.name,
        referralCode: user.referralCode,
        trustLevel: getTrustLevel(displayedPoints),
        points: displayedPoints,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        ceilingAllowed: user.ceiling,
        ceilingUsed: user.ceiling - ceilingAvailable,
        realPoints: user.points,
        ceilingPoints: (0, ceiling_service_1.effectivePoints)(user.points, user.isPremium, settings.freePointsCap),
        freePointsCap: settings.freePointsCap,
        ceilingAvailable,
        aidRequestsCount,
        nextDueDate,
        referralsCount,
        walletBalance,
    };
}

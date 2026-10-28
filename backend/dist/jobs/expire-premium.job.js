"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expirePremiumSubscriptions = expirePremiumSubscriptions;
const client_1 = require("../db/client");
const points_service_1 = require("../modules/points/points.service");
const notification_service_1 = require("../modules/notifications/notification.service");
/**
 * Désactive les abonnements AIFI+ payés dont la date d'expiration est
 * dépassée. Ne touche jamais un accès accordé à vie par un admin
 * (premiumExpiresAt === null) — seul un abonnement payé peut expirer.
 */
async function expirePremiumSubscriptions() {
    const now = new Date();
    const expired = await client_1.prisma.user.findMany({
        where: { isPremium: true, premiumExpiresAt: { not: null, lt: now } },
        select: { id: true },
    });
    for (const user of expired) {
        await client_1.prisma.user.update({
            where: { id: user.id },
            data: { isPremium: false, premiumExpiresAt: null },
        });
        await (0, points_service_1.recomputeCeilingForUser)(user.id);
        await (0, notification_service_1.notifyUser)(user.id, "premium_expired", {});
    }
    return { expired: expired.length };
}

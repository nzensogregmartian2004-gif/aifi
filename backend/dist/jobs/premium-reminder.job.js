"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREMIUM_REMINDER_STEPS = void 0;
exports.sendPremiumExpiryReminders = sendPremiumExpiryReminders;
const client_1 = require("../db/client");
const notification_service_1 = require("../modules/notifications/notification.service");
const DAY_MS = 86400000;
/** Paliers de rappel avant l'échéance d'un abonnement AIFI+ (du plus lointain au plus proche). */
exports.PREMIUM_REMINDER_STEPS = [
    { level: 1, days: 30 }, // dernier mois : laisser le temps de préparer le renouvellement
    { level: 2, days: 7 }, // dernière semaine
];
/**
 * Prévient les abonnés AIFI+ à chaque palier. Un seul message par palier et par échéance :
 * si le client arrive directement sous 7 jours, on n'envoie que le message le plus proche.
 * Un renouvellement change l'échéance, donc le niveau repart de zéro.
 */
async function sendPremiumExpiryReminders(now = new Date(), db = client_1.prisma, notify = notification_service_1.notifyUser) {
    const horizon = new Date(now.getTime() + exports.PREMIUM_REMINDER_STEPS[0].days * DAY_MS);
    const users = await db.user.findMany({
        where: { isPremium: true, premiumExpiresAt: { gt: now, lte: horizon } },
        select: { id: true, premiumExpiresAt: true, premiumReminderFor: true, premiumReminderLevel: true },
    });
    let reminded = 0;
    for (const u of users) {
        const expiry = u.premiumExpiresAt;
        const sameExpiry = u.premiumReminderFor?.getTime() === expiry.getTime();
        const sentLevel = sameExpiry ? u.premiumReminderLevel : 0;
        const daysLeft = Math.max(1, Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS));
        // Palier le plus proche atteint par le client
        const reached = exports.PREMIUM_REMINDER_STEPS.filter((s) => daysLeft <= s.days).map((s) => s.level);
        const target = reached.length ? Math.max(...reached) : 0;
        if (target <= sentLevel)
            continue;
        await notify(u.id, "premium_expiring", { days: daysLeft });
        await db.user.update({
            where: { id: u.id },
            data: { premiumReminderFor: expiry, premiumReminderLevel: target },
        });
        reminded++;
    }
    return { reminded };
}

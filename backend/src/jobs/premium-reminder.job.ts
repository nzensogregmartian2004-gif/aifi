import { prisma } from "../db/client";
import { notifyUser } from "../modules/notifications/notification.service";

const REMINDER_DAYS = 7;

/**
 * Prévient les abonnés AIFI+ 7 jours avant l'échéance. Un seul rappel par échéance
 * (premiumReminderFor), pour ne pas harceler.
 */
export async function sendPremiumExpiryReminders() {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_DAYS * 86400000);
  const users = await prisma.user.findMany({
    where: { isPremium: true, premiumExpiresAt: { gt: now, lte: horizon } },
    select: { id: true, premiumExpiresAt: true, premiumReminderFor: true },
  });

  let reminded = 0;
  for (const u of users) {
    if (!u.premiumExpiresAt) continue;
    if (u.premiumReminderFor && u.premiumReminderFor.getTime() === u.premiumExpiresAt.getTime()) continue;

    const days = Math.max(1, Math.ceil((u.premiumExpiresAt.getTime() - now.getTime()) / 86400000));
    await notifyUser(
      u.id,
      "premium_expiring",
      { days }
    );
    await prisma.user.update({ where: { id: u.id }, data: { premiumReminderFor: u.premiumExpiresAt } });
    reminded++;
  }
  return { reminded };
}

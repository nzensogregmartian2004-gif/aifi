import { prisma } from "../db/client";
import { recomputeCeilingForUser } from "../modules/points/points.service";
import { notifyUser } from "../modules/notifications/notification.service";

/**
 * Désactive les abonnements AIFI+ payés dont la date d'expiration est
 * dépassée. Ne touche jamais un accès accordé à vie par un admin
 * (premiumExpiresAt === null) — seul un abonnement payé peut expirer.
 */
export async function expirePremiumSubscriptions() {
  const now = new Date();
  const expired = await prisma.user.findMany({
    where: { isPremium: true, premiumExpiresAt: { not: null, lt: now } },
    select: { id: true },
  });

  for (const user of expired) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isPremium: false, premiumExpiresAt: null },
    });
    await recomputeCeilingForUser(user.id);
    await notifyUser(
      user.id,
      "premium_expired",
      {}
    );
  }

  return { expired: expired.length };
}

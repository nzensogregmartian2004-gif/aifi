import { blacklistUser } from "../modules/blacklist/blacklist.service";
import { prisma } from "../db/client";
import { suspendUser } from "../modules/users/admin-user.service";
import { addPoints } from "../modules/points/points.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bloque un compte dont une demande est en retard depuis `lateBlockDays` jours
 * (15 par défaut). Au blocage, les points de confiance tombent à zéro.
 * Réversible : seul un admin peut réactiver le compte (ce job ne débloque jamais).
 */
export async function blockOverdueAccounts() {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const limit = Date.now() - settings.lateBlockDays * DAY_MS;

  const candidates = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED", "LATE"] },
      dueDate: { lt: new Date(limit + settings.premiumGraceDays * DAY_MS) },
      user: { status: "ACTIVE" },
    },
    select: { userId: true, dueDate: true, user: { select: { isPremium: true } } },
  });

  // Sursis AIFI+ appliqué ici aussi, demande par demande.
  const overdueUserIds = [
    ...new Set(
      candidates
        .filter((r) => {
          const grace = r.user.isPremium ? settings.premiumGraceDays : 0;
          return r.dueDate!.getTime() + grace * DAY_MS <= limit;
        })
        .map((r) => r.userId)
    ),
  ];

  if (overdueUserIds.length === 0) return { blocked: 0 };

  const systemAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!systemAdmin) {
    console.error("[blockOverdueAccounts] Aucun admin en base : blocage automatique impossible (le journal exige un adminId).");
    return { blocked: 0 };
  }

  let blocked = 0;
  for (const userId of overdueUserIds) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { points: true } });
    if (user.points > 0) {
      await addPoints(userId, -user.points, "blocage_retard");
    }
    await suspendUser(
      userId,
      systemAdmin.id,
      `Compte bloqué automatiquement : remboursement en retard depuis ${settings.lateBlockDays} jours. Contacte l'administrateur pour régulariser et débloquer ton compte.`
    );
    await blacklistUser(userId, `Blocage automatique : retard de ${settings.lateBlockDays} jours`, "AUTO_BLOCK");
    blocked++;
  }

  return { blocked };
}

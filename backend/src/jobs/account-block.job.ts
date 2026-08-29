import { prisma } from "../db/client";
import { suspendUser } from "../modules/users/admin-user.service";

const LATE_DAYS_BEFORE_BLOCK = 3;

/**
 * Bloque automatiquement (status SUSPENDED) tout utilisateur ayant au moins
 * une demande d'aide en retard depuis plus de LATE_DAYS_BEFORE_BLOCK jours.
 * Le blocage se base sur `latePenaltyAppliedAt` (posé par late-penalty.job.ts
 * le jour où le retard commence) — donc "3 jours après le début du retard",
 * pas "3 jours après l'échéance + 1 jour de battement".
 *
 * Réversible : un admin peut débloquer via `reactivateUser` (déjà existant,
 * bouton "Réactiver" côté écran admin détail utilisateur) — ce job ne fait
 * que le blocage, jamais le déblocage.
 *
 * On ne re-bloque pas un compte déjà SUSPENDED (filtre user.status ACTIVE) :
 * évite de spammer notifications/logs d'audit à chaque exécution tant que
 * l'admin n'a pas traité le cas.
 */
export async function blockOverdueAccounts() {
  const threshold = new Date(Date.now() - LATE_DAYS_BEFORE_BLOCK * 24 * 60 * 60 * 1000);

  const overdueUsers = await prisma.aidRequest.findMany({
    where: {
      status: "LATE",
      latePenaltyAppliedAt: { lte: threshold },
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  if (overdueUsers.length === 0) return { blocked: 0 };

  const systemAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!systemAdmin) {
    console.error("[blockOverdueAccounts] Aucun admin trouvé en base — blocage automatique impossible (audit log exige un adminId).");
    return { blocked: 0 };
  }

  let blocked = 0;
  for (const { userId } of overdueUsers) {
    await suspendUser(
      userId,
      systemAdmin.id,
      `Compte bloqué automatiquement : remboursement en retard depuis plus de ${LATE_DAYS_BEFORE_BLOCK} jours. Contacte l'administrateur pour régulariser et débloquer ton compte.`
    );
    blocked++;
  }

  return { blocked };
}

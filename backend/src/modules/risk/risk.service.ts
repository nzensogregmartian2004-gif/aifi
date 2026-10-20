import { prisma } from "../../db/client";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Niveaux de risque, indexés par le nombre de paliers de retard atteints (0 = aucun retard). */
export const RISK_LEVELS = ["Aucun", "Faible", "Moyen", "Élevé", "Très élevé", "Dangereux"] as const;

/** Demandes d'aide ouvertes pour lesquelles un remboursement est attendu. */
const OPEN_STATUSES = ["ACCEPTED", "DISBURSED", "LATE"] as const;

/**
 * Situation de risque d'un client, calculée à partir de ses demandes ouvertes.
 * Chaque demande a son propre compteur de paliers (latePenaltySteps). Le niveau
 * affiché est celui de la demande la plus en retard.
 */
export async function getUserRisk(userId: string) {
  const now = Date.now();
  const [user, settings, open] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, points: true, isPremium: true, ceiling: true },
    }),
    prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } }),
    prisma.aidRequest.findMany({
      where: { userId, status: { in: [...OPEN_STATUSES] }, dueDate: { not: null } },
      select: { id: true, amount: true, dueDate: true, latePenaltySteps: true },
    }),
  ]);

  const grace = user.isPremium ? settings.premiumGraceDays : 0;
  const maxSteps = Math.ceil(settings.lateBlockDays / settings.lateStepDays);

  let worst: { daysLate: number; steps: number; due: number; amount: number } | null = null;
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const r of open) {
    const due = r.dueDate!.getTime() + grace * DAY_MS;
    const daysLate = Math.floor((now - due) / DAY_MS);
    if (daysLate < 0) continue;
    overdueCount++;
    overdueAmount += r.amount;
    if (!worst || daysLate > worst.daysLate) {
      worst = { daysLate, steps: r.latePenaltySteps, due, amount: r.amount };
    }
  }

  const blocked = user.status === "SUSPENDED";
  let level: string;
  if (blocked) level = "Bloqué";
  else if (!worst) level = RISK_LEVELS[0];
  else level = RISK_LEVELS[Math.min(worst.steps, RISK_LEVELS.length - 1)];

  // Prochain palier : il tombe au jour (paliers faits × lateStepDays) après l'échéance.
  const nextStep = worst && worst.steps < maxSteps ? worst.due + worst.steps * settings.lateStepDays * DAY_MS : null;
  const blockAt = worst ? worst.due + settings.lateBlockDays * DAY_MS - (grace > 0 ? 0 : 0) : null;

  return {
    level,
    blocked,
    points: user.points,
    ceiling: user.ceiling,
    overdueCount,
    overdueAmount,
    daysLate: worst?.daysLate ?? 0,
    stepsDone: worst?.steps ?? 0,
    maxSteps,
    nextPenaltyAt: nextStep ? new Date(nextStep).toISOString() : null,
    blockAt: blockAt ? new Date(blockAt).toISOString() : null,
    lateStepDays: settings.lateStepDays,
    lateBlockDays: settings.lateBlockDays,
    latePenaltyPoints: settings.latePenaltyPoints,
  };
}

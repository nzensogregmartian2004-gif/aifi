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

/** Vue globale du risque : répartition par niveau, tranches de retard, plus gros dossiers en retard. */
export async function getRiskOverview() {
  const now = Date.now();
  const [settings, activeClients, open] = await Promise.all([
    prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } }),
    prisma.user.count({ where: { role: "CLIENT", status: "ACTIVE" } }),
    prisma.aidRequest.findMany({
      where: { status: { in: [...OPEN_STATUSES] }, dueDate: { not: null } },
      select: {
        userId: true,
        amount: true,
        dueDate: true,
        latePenaltySteps: true,
        user: { select: { name: true, isPremium: true, status: true } },
      },
    }),
  ]);

  const buckets: Record<string, number> = { "1 à 3 j": 0, "4 à 9 j": 0, "10 à 15 j": 0, "Plus de 15 j": 0 };
  const perUser = new Map<
    string,
    { name: string; blocked: boolean; steps: number; overdueAmount: number; daysLate: number; count: number }
  >();

  for (const r of open) {
    const grace = r.user.isPremium ? settings.premiumGraceDays : 0;
    const due = r.dueDate!.getTime() + grace * DAY_MS;
    const daysLate = Math.floor((now - due) / DAY_MS);
    if (daysLate < 0) continue;

    const key =
      daysLate <= 3 ? "1 à 3 j" : daysLate <= 9 ? "4 à 9 j" : daysLate <= 15 ? "10 à 15 j" : "Plus de 15 j";
    buckets[key] += r.amount;

    const current = perUser.get(r.userId) || {
      name: r.user.name,
      blocked: r.user.status === "SUSPENDED",
      steps: 0,
      overdueAmount: 0,
      daysLate: 0,
      count: 0,
    };
    current.steps = Math.max(current.steps, r.latePenaltySteps);
    current.overdueAmount += r.amount;
    current.daysLate = Math.max(current.daysLate, daysLate);
    current.count += 1;
    perUser.set(r.userId, current);
  }

  const levelCounts: Record<string, number> = { Aucun: 0 };
  for (const label of [...RISK_LEVELS.slice(1), "Bloqué"]) levelCounts[label] = 0;

  const topClients = [...perUser.entries()]
    .map(([userId, u]) => {
      const level = u.blocked ? "Bloqué" : RISK_LEVELS[Math.min(u.steps, RISK_LEVELS.length - 1)];
      levelCounts[level] = (levelCounts[level] || 0) + 1;
      return { userId, name: u.name, level, overdueAmount: u.overdueAmount, daysLate: u.daysLate, count: u.count };
    })
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .slice(0, 20);

  levelCounts.Aucun = Math.max(0, activeClients - perUser.size);

  return {
    activeClients,
    overdueClients: perUser.size,
    totalOverdueAmount: Object.values(buckets).reduce((s, v) => s + v, 0),
    buckets: Object.entries(buckets).map(([label, amount]) => ({ label, amount })),
    levels: Object.entries(levelCounts).map(([label, count]) => ({ label, count })),
    topClients,
    lateStepDays: settings.lateStepDays,
    lateBlockDays: settings.lateBlockDays,
  };
}

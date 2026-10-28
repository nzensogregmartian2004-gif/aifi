import { prisma } from "../../db/client";
import { lateState, dailyInterest, LateState } from "../finance/rules";

/**
 * Niveaux de risque, selon l'état de la demande la plus en retard :
 * Sursis (jour de grâce), Majoré (1 à 7 jours de majoration), Élevé (plus de 7 jours).
 * Il n'y a plus de blocage automatique : seul un admin suspend un compte.
 */
export const RISK_LEVELS = ["Aucun", "Sursis", "Majoré", "Élevé"] as const;

/** Demandes ouvertes pour lesquelles un remboursement est attendu. */
const OPEN_STATUSES = ["ACCEPTED", "DISBURSED", "LATE"] as const;

function levelOf(state: LateState): string {
  if (state.phase === "ON_TIME") return RISK_LEVELS[0];
  if (state.phase === "GRACE") return RISK_LEVELS[1];
  return state.lateDays > 7 ? RISK_LEVELS[3] : RISK_LEVELS[2];
}

/** Situation de risque d'un client, calculée à partir de ses demandes ouvertes. */
export async function getUserRisk(userId: string) {
  const now = new Date();
  const [user, open] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, points: true, ceiling: true },
    }),
    prisma.aidRequest.findMany({
      where: { userId, status: { in: [...OPEN_STATUSES] }, dueDate: { not: null } },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        graceDays: true,
        interestAmount: true,
        gridDurationDays: true,
        lateSurchargeAmount: true,
      },
    }),
  ]);

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" }, select: { latePenaltyPoints: true } });
  let worst: { state: LateState; request: (typeof open)[number] } | null = null;
  let overdueCount = 0;
  let overdueAmount = 0;
  let surchargeTotal = 0;

  for (const r of open) {
    const state = lateState(r.dueDate!, now, r.graceDays);
    if (state.phase === "ON_TIME") continue;
    overdueCount++;
    overdueAmount += r.amount;
    surchargeTotal += r.lateSurchargeAmount;
    if (!worst || state.daysAfterDue > worst.state.daysAfterDue) {
      worst = { state, request: r };
    }
  }

  return {
    level: worst ? levelOf(worst.state) : RISK_LEVELS[0],
    suspended: user.status === "SUSPENDED",
    points: user.points,
    ceiling: user.ceiling,
    overdueCount,
    overdueAmount,
    daysLate: worst?.state.lateDays ?? 0,
    graceDaysLeft: worst?.state.graceDaysLeft ?? 0,
    graceDays: worst?.request.graceDays ?? 0,
    surchargeTotal,
    dailyAmount: worst ? Math.round(dailyInterest(worst.request.interestAmount, worst.request.gridDurationDays)) : 0,
    pointsPerDay: settings.latePenaltyPoints,
  };
}

/** Vue globale du risque : répartition par niveau, tranches de retard, plus gros dossiers en retard. */
export async function getRiskOverview() {
  const now = new Date();
  const [activeClients, open] = await Promise.all([
    prisma.user.count({ where: { role: "CLIENT", status: "ACTIVE" } }),
    prisma.aidRequest.findMany({
      where: { status: { in: [...OPEN_STATUSES] }, dueDate: { not: null } },
      select: {
        userId: true,
        amount: true,
        dueDate: true,
        graceDays: true,
        user: { select: { name: true, status: true } },
      },
    }),
  ]);

  const buckets: Record<string, number> = { Sursis: 0, "1 à 7 j": 0, "8 à 15 j": 0, "Plus de 15 j": 0 };
  const perUser = new Map<
    string,
    { name: string; suspended: boolean; level: string; overdueAmount: number; daysLate: number; count: number }
  >();

  for (const r of open) {
    const state = lateState(r.dueDate!, now, r.graceDays);
    if (state.phase === "ON_TIME") continue;

    const key =
      state.phase === "GRACE"
        ? "Sursis"
        : state.lateDays <= 7
          ? "1 à 7 j"
          : state.lateDays <= 15
            ? "8 à 15 j"
            : "Plus de 15 j";
    buckets[key] += r.amount;

    const level = levelOf(state);
    const current = perUser.get(r.userId) || {
      name: r.user.name,
      suspended: r.user.status === "SUSPENDED",
      level,
      overdueAmount: 0,
      daysLate: 0,
      count: 0,
    };
    // Le niveau retenu pour un client est celui de son dossier le plus en retard.
    if (state.daysAfterDue > 0 && levelRank(level) > levelRank(current.level)) current.level = level;
    current.overdueAmount += r.amount;
    current.daysLate = Math.max(current.daysLate, state.lateDays);
    current.count += 1;
    perUser.set(r.userId, current);
  }

  const levelCounts: Record<string, number> = { Aucun: 0 };
  for (const label of RISK_LEVELS.slice(1)) levelCounts[label] = 0;

  const topClients = [...perUser.entries()]
    .map(([userId, u]) => {
      const level = u.suspended ? "Suspendu" : u.level;
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
  };
}

function levelRank(label: string): number {
  return (RISK_LEVELS as readonly string[]).indexOf(label);
}

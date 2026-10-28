import { prisma } from "../../db/client";

type MonthCount = { month: Date; count: bigint };
type MonthTotal = { month: Date; total: bigint };

function toMonthlySeries(rows: MonthCount[] | MonthTotal[], field: "count" | "total") {
  return rows.map((r: any) => ({
    month: r.month.toISOString().slice(0, 7), // "2026-09"
    value: Number(r[field] ?? 0),
  }));
}

/**
 * Statistiques agrégées pour la zone analytique admin (présentation à une
 * micro-finance) : croissance des clients, volumes décaissés/remboursés
 * mois par mois, et indicateurs de risque.
 *
 * Sur les "pertes" : le modèle de données n'a pas de statut "créance
 * définitivement perdue" (radiation) — seulement PENDING/ACCEPTED/.../LATE.
 * On calcule donc une perte POTENTIELLE : le montant encore dû sur les
 * demandes actuellement en retard (LATE), pas une perte confirmée.
 */
export async function getAnalytics(db: typeof prisma = prisma) {
  const [newClientsPerMonth, disbursedPerMonth, repaidPerMonth] = await Promise.all([
    db.$queryRaw<MonthCount[]>`
      SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS count
      FROM "User"
      WHERE role = 'CLIENT'
      GROUP BY 1 ORDER BY 1
    `,
    db.$queryRaw<MonthTotal[]>`
      SELECT date_trunc('month', "createdAt") AS month, COALESCE(SUM(amount), 0)::bigint AS total
      FROM "AidRequest"
      WHERE status IN ('DISBURSED', 'REPAID', 'LATE')
      GROUP BY 1 ORDER BY 1
    `,
    db.$queryRaw<MonthTotal[]>`
      SELECT date_trunc('month', "createdAt") AS month, COALESCE(SUM(amount), 0)::bigint AS total
      FROM "Repayment"
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  const [totalClients, activeClients, premiumClients, statusCounts, lateAidRequests, disbursedAgg, repaidAgg] =
    await Promise.all([
      db.user.count({ where: { role: "CLIENT" } }),
      db.user.count({ where: { role: "CLIENT", status: "ACTIVE" } }),
      db.user.count({ where: { role: "CLIENT", isPremium: true } }),
      db.aidRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      db.aidRequest.findMany({ where: { status: "LATE" }, include: { repayments: true } }),
      db.aidRequest.aggregate({
        _sum: { amount: true },
        where: { status: { in: ["DISBURSED", "REPAID", "LATE"] } },
      }),
      db.repayment.aggregate({ _sum: { amount: true } }),
    ]);

  const outstandingPerLateLoan = lateAidRequests.map(
    (ar) => ar.amountDue - ar.repayments.reduce((s, r) => s + r.amount, 0)
  );
  const totalAtRisk = outstandingPerLateLoan.reduce((s, v) => s + v, 0);
  const openLoans = await db.aidRequest.findMany({
    where: { status: { in: ["DISBURSED", "LATE"] } },
    include: { repayments: true },
  });
  const totalOutstanding = openLoans.reduce(
    (s: number, ar: any) => s + ar.amountDue - ar.repayments.reduce((x: number, r: any) => x + r.amount, 0),
    0
  );
  const averageLossPerLateLoan =
    lateAidRequests.length > 0 ? Math.round(totalAtRisk / lateAidRequests.length) : 0;

  const concludedCount = statusCounts
    .filter((s) => ["DISBURSED", "REPAID", "LATE"].includes(s.status))
    .reduce((sum, s) => sum + s._count._all, 0);
  const lateCount = statusCounts.find((s) => s.status === "LATE")?._count._all || 0;
  const lateRatePercent = concludedCount > 0 ? Math.round((lateCount / concludedCount) * 1000) / 10 : 0;

  return {
    kpis: {
      totalOutstanding,
      totalClients,
      activeClients,
      premiumClients,
      totalDisbursedAllTime: disbursedAgg._sum.amount || 0,
      totalRepaidAllTime: repaidAgg._sum.amount || 0,
      lateRatePercent, // % des demandes conclues (décaissées/remboursées/en retard) actuellement en retard
      lateLoansCount: lateCount,
      totalAtRisk, // encours restant dû sur les demandes actuellement en retard
      averageLossPerLateLoan,
    },
    monthly: {
      newClients: toMonthlySeries(newClientsPerMonth, "count"),
      amountDisbursed: toMonthlySeries(disbursedPerMonth, "total"),
      amountRepaid: toMonthlySeries(repaidPerMonth, "total"),
    },
  };
}

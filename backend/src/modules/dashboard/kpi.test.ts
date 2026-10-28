/**
 * Audit des indicateurs : on exécute les VRAIES fonctions du tableau de bord admin
 * et de l'analyse sur un jeu de données connu, et on compare aux totaux calculés à la main.
 * Le faux client ci-dessous interprète les filtres (where, groupBy, SQL brut) : si une
 * formule filtre mal, le test échoue.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getAdminDashboard } from "./admin-dashboard.service";
import { getAnalytics } from "../analytics/analytics.service";

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    const value = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("notIn" in cond) return !cond.notIn.includes(value);
      throw new Error(`opérateur non géré par le faux client : ${Object.keys(cond).join(",")}`);
    }
    return value === cond;
  });
}

const sum = (rows: Row[], field: string) => rows.reduce((s, r) => s + (r[field] ?? 0), 0);

function buildFakeDb(data: { users: Row[]; aidRequests: Row[]; repayments: Row[]; walletEntries?: Row[] }) {
  const tables: Record<string, Row[]> = {
    user: data.users,
    aidRequest: data.aidRequests,
    repayment: data.repayments,
    walletEntry: data.walletEntries ?? [],
    withdrawal: [],
    repaymentDeclaration: [],
  };
  const models: Record<string, any> = {};
  for (const [name, rows] of Object.entries(tables)) {
    models[name] = {
      count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
      findMany: async ({ where, include }: any = {}) =>
        rows
          .filter((r) => matches(r, where))
          .map((r) =>
            include?.repayments
              ? { ...r, repayments: data.repayments.filter((x) => x.aidRequestId === r.id) }
              : r
          ),
      aggregate: async ({ where, _sum }: any) => {
        const subset = rows.filter((r) => matches(r, where));
        return { _sum: { [Object.keys(_sum)[0]]: sum(subset, Object.keys(_sum)[0]) || null } };
      },
      groupBy: async ({ by, where }: any) => {
        const subset = rows.filter((r) => matches(r, where));
        const groups = new Map<string, number>();
        for (const r of subset) groups.set(r[by[0]], (groups.get(by[0]) ?? 0) + 1);
        return [...groups.entries()].map(([key, n]) => ({ [by[0]]: key, _count: { _all: n } }));
      },
    };
  }

  const monthOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const byMonth = (rows: Row[], field: string) => {
    const acc = new Map<number, { month: Date; total: bigint }>();
    for (const r of rows) {
      const m = monthOf(r.createdAt);
      const cur = acc.get(m.getTime()) ?? { month: m, total: 0n };
      cur.total += BigInt(r[field]);
      acc.set(m.getTime(), cur);
    }
    return [...acc.values()].sort((a, b) => a.month.getTime() - b.month.getTime());
  };

  // $queryRaw : seules les requêtes SQL de l'analyse sont gérées ; le filtre de statut du SQL est interprété
  const queryRaw = async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "User"')) return [];
    if (sql.includes('FROM "AidRequest"')) {
      const m = sql.match(/status\s+(NOT\s+)?IN\s*\(([^)]*)\)/i);
      if (!m) throw new Error("filtre de statut absent du SQL de l'analyse");
      const list = [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]);
      const negate = !!m[1];
      const subset = data.aidRequests.filter((r) => (negate ? !list.includes(r.status) : list.includes(r.status)));
      return byMonth(subset, "amount");
    }
    if (sql.includes('FROM "Repayment"')) return byMonth(data.repayments, "amount");
    throw new Error("requête SQL non gérée par le faux client");
  };

  // Un modèle absent du faux client fait échouer le test explicitement (pas de faux positif silencieux)
  return new Proxy(
    { ...models, $queryRaw: queryRaw },
    {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        throw new Error(`modèle non simulé : ${prop}`);
      },
    }
  ) as any;
}

// ---------------------------------------------------------------------------
// Jeu de données : 4 clients, 2 administrateurs (+ 1 admin en attente pour vérifier qu'il n'est pas compté).
// Prêts : 1 décaissé, 1 remboursé, 1 en retard, 1 accepté non décaissé, 1 en attente, 1 rejeté.
// ---------------------------------------------------------------------------
const D = new Date("2026-09-15T10:00:00Z");
const fixture = {
  users: [
    { id: "c1", role: "CLIENT", status: "ACTIVE", isPremium: true },
    { id: "c2", role: "CLIENT", status: "ACTIVE", isPremium: false },
    { id: "c3", role: "CLIENT", status: "PENDING", isPremium: false },
    { id: "c4", role: "CLIENT", status: "SUSPENDED", isPremium: false },
    { id: "a1", role: "ADMIN", status: "ACTIVE", isPremium: false, isSuperAdmin: true },
    { id: "a2", role: "ADMIN", status: "ACTIVE", isPremium: false, isSuperAdmin: false },
    { id: "a3", role: "ADMIN", status: "PENDING", isPremium: false, isSuperAdmin: false },
  ],
  aidRequests: [
    { id: "r1", userId: "c1", amount: 1000, amountDue: 1330, status: "DISBURSED", createdAt: D },
    { id: "r2", userId: "c2", amount: 5000, amountDue: 6650, status: "REPAID", createdAt: D },
    { id: "r3", userId: "c3", amount: 2000, amountDue: 2660, status: "LATE", createdAt: D },
    { id: "r4", userId: "c4", amount: 3000, amountDue: 3990, status: "ACCEPTED", createdAt: D },
    { id: "r5", userId: "c2", amount: 4000, amountDue: 5320, status: "PENDING", createdAt: D },
    { id: "r6", userId: "c1", amount: 1500, amountDue: 1995, status: "REJECTED", createdAt: D },
  ],
  repayments: [
    { id: "p1", aidRequestId: "r1", amount: 330, createdAt: D },
    { id: "p2", aidRequestId: "r2", amount: 6650, createdAt: D },
    { id: "p3", aidRequestId: "r3", amount: 500, createdAt: D },
  ],
};

describe("tableau de bord admin : indicateurs contrôlés sur un jeu connu", () => {
  test("total utilisateurs = clients uniquement (4), administrateurs exclus", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.totalUsers, 4);
  });
  test("comptes en attente = clients en attente (1), pas les administrateurs", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.pendingAccounts, 1);
  });
  test("demandes en attente = 1", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.pendingAidRequests, 1);
  });
  test("prêts actifs = acceptés + décaissés + en retard (3) : le retard est un sous-ensemble des actifs", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.activeAidRequests, 3);
    assert.equal(d.lateAidRequests, 1);
  });
  test("fonds distribués = décaissés + remboursés + en retard (1000 + 5000 + 2000 = 8000)", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.totalFundsDistributed, 8000);
  });
  test("total remboursé = somme des remboursements (330 + 6650 + 500 = 7480)", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.totalRepayments, 7480);
  });
  test("encours restant dû = décaissés/en retard : (1330 − 330) + (2660 − 500) = 3160", async () => {
    const d = await getAdminDashboard(buildFakeDb(fixture));
    assert.equal(d.outstandingAmount, 3160);
  });
});

describe("analyse admin : indicateurs contrôlés sur un jeu connu", () => {
  test("clients, clients actifs, abonnés AIFI+ : 4 / 2 / 1", async () => {
    const a = await getAnalytics(buildFakeDb(fixture));
    assert.equal(a.kpis.totalClients, 4);
    assert.equal(a.kpis.activeClients, 2);
    assert.equal(a.kpis.premiumClients, 1);
  });
  test("fonds décaissés (SQL et cumul) = 8000 : un prêt accepté mais pas encore décaissé n'en fait pas partie", async () => {
    const a = await getAnalytics(buildFakeDb(fixture));
    assert.equal(a.kpis.totalDisbursedAllTime, 8000);
    assert.equal(a.monthly.amountDisbursed[0].value, 8000);
  });
  test("total remboursé = 7480 (cumul et mensuel)", async () => {
    const a = await getAnalytics(buildFakeDb(fixture));
    assert.equal(a.kpis.totalRepaidAllTime, 7480);
    assert.equal(a.monthly.amountRepaid[0].value, 7480);
  });
  test("taux de retard = 1 retard sur 3 prêts conclus (décaissé, remboursé, en retard) = 33,3 %", async () => {
    const a = await getAnalytics(buildFakeDb(fixture));
    assert.equal(a.kpis.lateRatePercent, 33.3);
  });
  test("encours en retard = 2160 et encours total = 3160", async () => {
    const a = await getAnalytics(buildFakeDb(fixture));
    assert.equal(a.kpis.totalAtRisk, 2160);
    assert.equal(a.kpis.totalOutstanding, 3160);
  });
});

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "path";

// Base simulée : seules les opérations utilisées par le job de retard sont implémentées.
const state: any = { settings: {}, requests: [], user: {}, notifs: [] };
const fake: any = {
  appSettings: {
    findUniqueOrThrow: async () => state.settings,
  },
  aidRequest: {
    findMany: async ({ where }: any) =>
      state.requests
        .filter((r: any) => where.status.in.includes(r.status) && r.dueDate < where.dueDate.lt)
        .map((r: any) => ({ ...r, user: { status: state.user.status } })),
    update: async ({ where, data }: any) => {
      const r = state.requests.find((x: any) => x.id === where.id);
      Object.assign(r, data);
      return r;
    },
  },
  user: {
    findUniqueOrThrow: async () => ({ points: state.user.points, isPremium: false, ceiling: 0 }),
    findUnique: async () => ({ pushToken: null, language: "fr", pushEnabled: true }),
    update: async ({ data }: any) => {
      if (data.points?.increment !== undefined) state.user.points += data.points.increment;
      if (typeof data.points === "number") state.user.points = data.points;
      return { points: state.user.points, isPremium: false, ceiling: 0 };
    },
  },
  ceilingTier: { findMany: async () => [] },
  notification: { create: async ({ data }: any) => { state.notifs.push(data); return data; } },
};
const clientPath = require.resolve(path.resolve("src/db/client.ts"));
(require as any).cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { prisma: fake } };

const DUE = new Date("2026-11-01T00:00:00Z");
const after = (days: number) => new Date(DUE.getTime() + days * 86400000);
const loan = (id: string, userId: string) => ({
  id, userId, status: "DISBURSED", dueDate: DUE, graceDays: 1, amountDue: 1000, interestAmount: 300,
  gridDurationDays: 30, lateDaysCharged: 0, lateSurchargeAmount: 0, lateNotifiedAt: null,
});

describe("pénalité de confiance : une seule fois, montant réglable", () => {
  beforeEach(() => {
    state.requests = [loan("a1", "u1")];
    state.user = { status: "ACTIVE", points: 25 };
    state.settings = { latePenaltyPoints: 7 };
    state.notifs = [];
  });

  test("premier jour de retard : les points baissent du montant réglé dans l'admin", async () => {
    const job: any = await import(path.resolve("src/jobs/late-surcharge.job.ts"));
    await (job.applyLateSurcharges ?? job.default.applyLateSurcharges)(after(3));
    assert.equal(state.user.points, 18, "25 - 7 = 18");
  });

  test("jours suivants : aucune nouvelle déduction", async () => {
    const job: any = await import(path.resolve("src/jobs/late-surcharge.job.ts"));
    const run = job.applyLateSurcharges ?? job.default.applyLateSurcharges;
    await run(after(3));
    await run(after(4));
    await run(after(5));
    assert.equal(state.user.points, 18, "toujours 18 : la pénalité n'est retirée qu'une fois");
  });

  test("l'admin change le montant : la nouvelle valeur est appliquée", async () => {
    state.settings = { latePenaltyPoints: 3 };
    const job: any = await import(path.resolve("src/jobs/late-surcharge.job.ts"));
    await (job.applyLateSurcharges ?? job.default.applyLateSurcharges)(after(3));
    assert.equal(state.user.points, 22, "25 - 3 = 22");
  });
});

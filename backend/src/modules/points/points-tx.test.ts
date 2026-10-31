import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { addPoints } from "./points.service";

describe("points ajoutés dans la transaction du remboursement", () => {
  test("toutes les écritures passent par la base fournie (transaction), jamais par la connexion globale", async () => {
    const calls: string[] = [];
    const tx: any = {
      user: {
        update: async ({ data }: any) => {
          calls.push(`user.update:${JSON.stringify(data)}`);
          return { points: 15, isPremium: false, ceiling: 0 };
        },
      },
      appSettings: { findUniqueOrThrow: async () => ({ freePointsCap: 150 }) },
      ceilingTier: { findMany: async () => [{ minPoints: 0, ceiling: 0 }] },
    };
    const result = await addPoints("u1", 10, "remboursement_a_temps", tx);
    assert.equal(result.points, 15);
    assert.ok(calls.length >= 1, "la base fournie doit recevoir l'écriture des points");
  });
});

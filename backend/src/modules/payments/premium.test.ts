/**
 * AIFI+ : l'activation d'un abonnement doit prolonger EXACTEMENT une fois, même si une
 * étape annexe (plafond, notification) échoue après l'écriture de la date d'expiration.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { activatePremiumSubscription } from "./payment.service";

const DAY = 86400000;

function makeDb(user: Record<string, any>, premiumDurationDays = 90) {
  const users = [user];
  const db: any = {
    user: {
      findUniqueOrThrow: async () => users[0],
      update: async ({ data }: any) => Object.assign(users[0], data),
    },
    appSettings: {
      findUniqueOrThrow: async () => ({ id: "singleton", premiumDurationDays }),
    },
  };
  return { db, user: users[0] };
}

const ok: any = async () => undefined;
const boom: any = async () => {
  throw new Error("panne simulée");
};

describe("activation AIFI+", () => {
  test("premier abonnement : AIFI+ actif, expiration dans la durée configurée (90 jours)", async () => {
    const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null });
    const before = Date.now();
    await activatePremiumSubscription("u1", { db, recompute: ok, notify: ok });
    assert.equal(user.isPremium, true);
    const delta = user.premiumExpiresAt.getTime() - before;
    assert.ok(delta > 89.9 * DAY && delta < 90.1 * DAY, `expiration à ${delta / DAY} jours`);
  });

  test("renouvellement anticipé : on prolonge depuis l'expiration existante, sans perdre les jours restants", async () => {
    const current = new Date(Date.now() + 10 * DAY);
    const { db, user } = makeDb({ id: "u1", isPremium: true, premiumExpiresAt: current, premiumSince: new Date() });
    await activatePremiumSubscription("u1", { db, recompute: ok, notify: ok });
    const delta = user.premiumExpiresAt.getTime() - current.getTime();
    assert.ok(delta > 89.9 * DAY && delta < 90.1 * DAY, `prolongation de ${delta / DAY} jours`);
  });

  test("la durée suit le réglage admin, jamais une valeur fixe (180 jours => 180 jours)", async () => {
    const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null }, 180);
    const before = Date.now();
    await activatePremiumSubscription("u1", { db, recompute: ok, notify: ok });
    const delta = user.premiumExpiresAt.getTime() - before;
    assert.ok(delta > 179.9 * DAY && delta < 180.1 * DAY, `expiration à ${delta / DAY} jours`);
  });

  test("une notification en panne ne fait pas échouer l'activation (pas de rejeu du paiement)", async () => {
    const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null });
    await assert.doesNotReject(activatePremiumSubscription("u1", { db, recompute: ok, notify: boom }));
    assert.equal(user.isPremium, true);
  });

  test("un plafond non recalculé ne fait pas échouer l'activation", async () => {
    const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null });
    await assert.doesNotReject(activatePremiumSubscription("u1", { db, recompute: boom, notify: ok }));
    assert.equal(user.isPremium, true);
  });

  test("une erreur AVANT l'écriture remonte (le paiement reste rejouable, rien n'a été prolongé)", async () => {
    const db: any = {
      user: { findUniqueOrThrow: async () => { throw new Error("base indisponible"); }, update: async () => { throw new Error("jamais appelé"); } },
      appSettings: { findUniqueOrThrow: async () => ({ premiumDurationDays: 30 }) },
    };
    await assert.rejects(activatePremiumSubscription("u1", { db, recompute: ok, notify: ok }), /base indisponible/);
  });
});

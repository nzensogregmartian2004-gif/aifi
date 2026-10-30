import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sendPremiumExpiryReminders } from "./premium-reminder.job";

const DAY = 86400000;
const NOW = new Date("2026-10-30T08:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

function makeDb(users: Record<string, any>[]) {
  const matches = (u: any, where: any) =>
    u.isPremium === where.isPremium &&
    (where.premiumExpiresAt === undefined ||
      (u.premiumExpiresAt !== null &&
        u.premiumExpiresAt > where.premiumExpiresAt.gt &&
        u.premiumExpiresAt <= where.premiumExpiresAt.lte));
  return {
    user: {
      findMany: async ({ where }: any) => users.filter((u) => matches(u, where)).map((u) => ({ ...u })),
      update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id) as any, data),
    },
  };
}

function setup(user: Record<string, any>) {
  const sent: { id: string; days: number }[] = [];
  const db = makeDb([user]);
  const notify: any = async (id: string, type: string, params: any) => {
    assert.equal(type, "premium_expiring");
    sent.push({ id, days: params.days });
  };
  return { db, sent, notify, user };
}

describe("rappels AIFI+", () => {
  test("pas de rappel tant qu'il reste plus de 30 jours", async () => {
    const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(45), premiumReminderFor: null, premiumReminderLevel: 0 });
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    assert.equal(s.sent.length, 0);
  });

  test("dernier mois : un rappel à 30 jours, puis aucun doublon le lendemain", async () => {
    const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(25), premiumReminderFor: null, premiumReminderLevel: 0 });
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    await sendPremiumExpiryReminders(new Date(NOW.getTime() + DAY), s.db, s.notify);
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].days, 25);
    assert.equal(s.user.premiumReminderLevel, 1);
  });

  test("dernière semaine : un second rappel à 7 jours, en plus de celui du dernier mois", async () => {
    const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(25), premiumReminderFor: null, premiumReminderLevel: 0 });
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    s.user.premiumExpiresAt = inDays(6);
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    assert.equal(s.sent.length, 2);
    assert.equal(s.sent[1].days, 6);
    assert.equal(s.user.premiumReminderLevel, 2);
  });

  test("arrivée directement sous 7 jours (job en retard) : un seul message, le plus proche", async () => {
    const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(5), premiumReminderFor: null, premiumReminderLevel: 0 });
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    assert.equal(s.sent.length, 1);
    assert.equal(s.user.premiumReminderLevel, 2);
  });

  test("renouvellement : une nouvelle échéance repart de zéro et déclenche à nouveau le rappel de 30 jours", async () => {
    const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(5), premiumReminderFor: null, premiumReminderLevel: 0 });
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    // Renouvellement : nouvelle échéance dans 85 jours, puis 25 jours avant la fin
    s.user.premiumExpiresAt = inDays(85);
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    assert.equal(s.sent.length, 1, "pas de rappel tant qu'il reste plus de 30 jours après renouvellement");
    s.user.premiumExpiresAt = inDays(25);
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    assert.equal(s.sent.length, 2);
    assert.equal(s.sent[1].days, 25);
  });

  test("un compte à vie (sans échéance) ne reçoit jamais de rappel", async () => {
    const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: null, premiumReminderFor: null, premiumReminderLevel: 0 });
    await sendPremiumExpiryReminders(NOW, s.db, s.notify);
    assert.equal(s.sent.length, 0);
  });
});

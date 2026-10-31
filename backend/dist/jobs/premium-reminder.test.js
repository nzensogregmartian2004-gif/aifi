"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const premium_reminder_job_1 = require("./premium-reminder.job");
const DAY = 86400000;
const NOW = new Date("2026-10-30T08:00:00Z");
const inDays = (n) => new Date(NOW.getTime() + n * DAY);
function makeDb(users) {
    const matches = (u, where) => u.isPremium === where.isPremium &&
        (where.premiumExpiresAt === undefined ||
            (u.premiumExpiresAt !== null &&
                u.premiumExpiresAt > where.premiumExpiresAt.gt &&
                u.premiumExpiresAt <= where.premiumExpiresAt.lte));
    return {
        user: {
            findMany: async ({ where }) => users.filter((u) => matches(u, where)).map((u) => ({ ...u })),
            update: async ({ where, data }) => Object.assign(users.find((u) => u.id === where.id), data),
        },
    };
}
function setup(user) {
    const sent = [];
    const db = makeDb([user]);
    const notify = async (id, type, params) => {
        strict_1.default.equal(type, "premium_expiring");
        sent.push({ id, days: params.days });
    };
    return { db, sent, notify, user };
}
(0, node_test_1.describe)("rappels AIFI+", () => {
    (0, node_test_1.test)("pas de rappel tant qu'il reste plus de 30 jours", async () => {
        const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(45), premiumReminderFor: null, premiumReminderLevel: 0 });
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        strict_1.default.equal(s.sent.length, 0);
    });
    (0, node_test_1.test)("dernier mois : un rappel à 30 jours, puis aucun doublon le lendemain", async () => {
        const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(25), premiumReminderFor: null, premiumReminderLevel: 0 });
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(new Date(NOW.getTime() + DAY), s.db, s.notify);
        strict_1.default.equal(s.sent.length, 1);
        strict_1.default.equal(s.sent[0].days, 25);
        strict_1.default.equal(s.user.premiumReminderLevel, 1);
    });
    (0, node_test_1.test)("dernière semaine : un second rappel à 7 jours, en plus de celui du dernier mois", async () => {
        const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(25), premiumReminderFor: null, premiumReminderLevel: 0 });
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        s.user.premiumExpiresAt = inDays(6);
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        strict_1.default.equal(s.sent.length, 2);
        strict_1.default.equal(s.sent[1].days, 6);
        strict_1.default.equal(s.user.premiumReminderLevel, 2);
    });
    (0, node_test_1.test)("arrivée directement sous 7 jours (job en retard) : un seul message, le plus proche", async () => {
        const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(5), premiumReminderFor: null, premiumReminderLevel: 0 });
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        strict_1.default.equal(s.sent.length, 1);
        strict_1.default.equal(s.user.premiumReminderLevel, 2);
    });
    (0, node_test_1.test)("renouvellement : une nouvelle échéance repart de zéro et déclenche à nouveau le rappel de 30 jours", async () => {
        const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: inDays(5), premiumReminderFor: null, premiumReminderLevel: 0 });
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        // Renouvellement : nouvelle échéance dans 85 jours, puis 25 jours avant la fin
        s.user.premiumExpiresAt = inDays(85);
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        strict_1.default.equal(s.sent.length, 1, "pas de rappel tant qu'il reste plus de 30 jours après renouvellement");
        s.user.premiumExpiresAt = inDays(25);
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        strict_1.default.equal(s.sent.length, 2);
        strict_1.default.equal(s.sent[1].days, 25);
    });
    (0, node_test_1.test)("un compte à vie (sans échéance) ne reçoit jamais de rappel", async () => {
        const s = setup({ id: "u1", isPremium: true, premiumExpiresAt: null, premiumReminderFor: null, premiumReminderLevel: 0 });
        await (0, premium_reminder_job_1.sendPremiumExpiryReminders)(NOW, s.db, s.notify);
        strict_1.default.equal(s.sent.length, 0);
    });
});

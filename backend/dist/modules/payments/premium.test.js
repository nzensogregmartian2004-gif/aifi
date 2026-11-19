"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * AIFI+ : l'activation d'un abonnement doit prolonger EXACTEMENT une fois, même si une
 * étape annexe (plafond, notification) échoue après l'écriture de la date d'expiration.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const payment_service_1 = require("./payment.service");
const DAY = 86400000;
function makeDb(user, premiumDurationDays = 90) {
    const users = [user];
    const db = {
        user: {
            findUniqueOrThrow: async () => users[0],
            update: async ({ data }) => Object.assign(users[0], data),
        },
        appSettings: {
            findUniqueOrThrow: async () => ({ id: "singleton", premiumDurationDays }),
        },
    };
    return { db, user: users[0] };
}
const ok = async () => undefined;
const boom = async () => {
    throw new Error("panne simulée");
};
(0, node_test_1.describe)("activation AIFI+", () => {
    (0, node_test_1.test)("premier abonnement : AIFI+ actif, expiration dans la durée configurée (90 jours)", async () => {
        const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null });
        const before = Date.now();
        await (0, payment_service_1.activatePremiumSubscription)("u1", { db, recompute: ok, notify: ok });
        strict_1.default.equal(user.isPremium, true);
        const delta = user.premiumExpiresAt.getTime() - before;
        strict_1.default.ok(delta > 89.9 * DAY && delta < 90.1 * DAY, `expiration à ${delta / DAY} jours`);
    });
    (0, node_test_1.test)("renouvellement anticipé : on prolonge depuis l'expiration existante, sans perdre les jours restants", async () => {
        const current = new Date(Date.now() + 10 * DAY);
        const { db, user } = makeDb({ id: "u1", isPremium: true, premiumExpiresAt: current, premiumSince: new Date() });
        await (0, payment_service_1.activatePremiumSubscription)("u1", { db, recompute: ok, notify: ok });
        const delta = user.premiumExpiresAt.getTime() - current.getTime();
        strict_1.default.ok(delta > 89.9 * DAY && delta < 90.1 * DAY, `prolongation de ${delta / DAY} jours`);
    });
    (0, node_test_1.test)("la durée suit le réglage admin, jamais une valeur fixe (180 jours => 180 jours)", async () => {
        const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null }, 180);
        const before = Date.now();
        await (0, payment_service_1.activatePremiumSubscription)("u1", { db, recompute: ok, notify: ok });
        const delta = user.premiumExpiresAt.getTime() - before;
        strict_1.default.ok(delta > 179.9 * DAY && delta < 180.1 * DAY, `expiration à ${delta / DAY} jours`);
    });
    (0, node_test_1.test)("une notification en panne ne fait pas échouer l'activation (pas de rejeu du paiement)", async () => {
        const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null });
        await strict_1.default.doesNotReject((0, payment_service_1.activatePremiumSubscription)("u1", { db, recompute: ok, notify: boom }));
        strict_1.default.equal(user.isPremium, true);
    });
    (0, node_test_1.test)("un plafond non recalculé ne fait pas échouer l'activation", async () => {
        const { db, user } = makeDb({ id: "u1", isPremium: false, premiumExpiresAt: null, premiumSince: null });
        await strict_1.default.doesNotReject((0, payment_service_1.activatePremiumSubscription)("u1", { db, recompute: boom, notify: ok }));
        strict_1.default.equal(user.isPremium, true);
    });
    (0, node_test_1.test)("une erreur AVANT l'écriture remonte (le paiement reste rejouable, rien n'a été prolongé)", async () => {
        const db = {
            user: { findUniqueOrThrow: async () => { throw new Error("base indisponible"); }, update: async () => { throw new Error("jamais appelé"); } },
            appSettings: { findUniqueOrThrow: async () => ({ premiumDurationDays: 30 }) },
        };
        await strict_1.default.rejects((0, payment_service_1.activatePremiumSubscription)("u1", { db, recompute: ok, notify: ok }), /base indisponible/);
    });
});

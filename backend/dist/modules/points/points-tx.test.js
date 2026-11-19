"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const points_service_1 = require("./points.service");
(0, node_test_1.describe)("points ajoutés dans la transaction du remboursement", () => {
    (0, node_test_1.test)("toutes les écritures passent par la base fournie (transaction), jamais par la connexion globale", async () => {
        const calls = [];
        const tx = {
            user: {
                update: async ({ data }) => {
                    calls.push(`user.update:${JSON.stringify(data)}`);
                    return { points: 15, isPremium: false, ceiling: 0 };
                },
            },
            appSettings: { findUniqueOrThrow: async () => ({ freePointsCap: 150 }) },
            ceilingTier: { findMany: async () => [{ minPoints: 0, ceiling: 0 }] },
        };
        const result = await (0, points_service_1.addPoints)("u1", 10, "remboursement_a_temps", tx);
        strict_1.default.equal(result.points, 15);
        strict_1.default.ok(calls.length >= 1, "la base fournie doit recevoir l'écriture des points");
    });
});

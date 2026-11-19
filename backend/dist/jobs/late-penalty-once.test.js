"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const path_1 = __importDefault(require("path"));
// Base simulée : seules les opérations utilisées par le job de retard sont implémentées.
const state = { settings: {}, requests: [], user: {}, notifs: [] };
const fake = {
    appSettings: {
        findUniqueOrThrow: async () => state.settings,
    },
    aidRequest: {
        findMany: async ({ where }) => state.requests
            .filter((r) => where.status.in.includes(r.status) && r.dueDate < where.dueDate.lt)
            .map((r) => ({ ...r, user: { status: state.user.status } })),
        update: async ({ where, data }) => {
            const r = state.requests.find((x) => x.id === where.id);
            Object.assign(r, data);
            return r;
        },
    },
    user: {
        findUniqueOrThrow: async () => ({ points: state.user.points, isPremium: false, ceiling: 0 }),
        findUnique: async () => ({ pushToken: null, language: "fr", pushEnabled: true }),
        update: async ({ data }) => {
            if (data.points?.increment !== undefined)
                state.user.points += data.points.increment;
            if (typeof data.points === "number")
                state.user.points = data.points;
            return { points: state.user.points, isPremium: false, ceiling: 0 };
        },
    },
    ceilingTier: { findMany: async () => [] },
    notification: { create: async ({ data }) => { state.notifs.push(data); return data; } },
};
const clientPath = require.resolve(path_1.default.resolve("src/db/client.ts"));
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { prisma: fake } };
const DUE = new Date("2026-11-01T00:00:00Z");
const after = (days) => new Date(DUE.getTime() + days * 86400000);
const loan = (id, userId) => ({
    id, userId, status: "DISBURSED", dueDate: DUE, graceDays: 1, amountDue: 1000, interestAmount: 300,
    gridDurationDays: 30, lateDaysCharged: 0, lateSurchargeAmount: 0, lateNotifiedAt: null,
});
(0, node_test_1.describe)("pénalité de confiance : une seule fois, montant réglable", () => {
    (0, node_test_1.beforeEach)(() => {
        state.requests = [loan("a1", "u1")];
        state.user = { status: "ACTIVE", points: 25 };
        state.settings = { latePenaltyPoints: 7 };
        state.notifs = [];
    });
    (0, node_test_1.test)("premier jour de retard : les points baissent du montant réglé dans l'admin", async () => {
        const job = await Promise.resolve(`${path_1.default.resolve("src/jobs/late-surcharge.job.ts")}`).then(s => __importStar(require(s)));
        await (job.applyLateSurcharges ?? job.default.applyLateSurcharges)(after(3));
        strict_1.default.equal(state.user.points, 18, "25 - 7 = 18");
    });
    (0, node_test_1.test)("jours suivants : aucune nouvelle déduction", async () => {
        const job = await Promise.resolve(`${path_1.default.resolve("src/jobs/late-surcharge.job.ts")}`).then(s => __importStar(require(s)));
        const run = job.applyLateSurcharges ?? job.default.applyLateSurcharges;
        await run(after(3));
        await run(after(4));
        await run(after(5));
        strict_1.default.equal(state.user.points, 18, "toujours 18 : la pénalité n'est retirée qu'une fois");
    });
    (0, node_test_1.test)("l'admin change le montant : la nouvelle valeur est appliquée", async () => {
        state.settings = { latePenaltyPoints: 3 };
        const job = await Promise.resolve(`${path_1.default.resolve("src/jobs/late-surcharge.job.ts")}`).then(s => __importStar(require(s)));
        await (job.applyLateSurcharges ?? job.default.applyLateSurcharges)(after(3));
        strict_1.default.equal(state.user.points, 22, "25 - 3 = 22");
    });
});

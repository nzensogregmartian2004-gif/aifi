"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "ACC_STARTUP1";
process.env.MYPVIT_URLCODE_RENEW_SECRET = "RENEW1";
process.env.MYPVIT_API_PASSWORD = "pw";
process.env.MYPVIT_RECEPTION_URL_CODE = "RECV1";
process.env.MYPVIT_CALLBACK_URL_CODE = "CB1";
(0, node_test_1.describe)("contrôle de connexion MyPVit au démarrage", () => {
    (0, node_test_1.test)("succès : le journal indique la connexion, sans jamais afficher la clé", async () => {
        const mod = await import("./mypvit.client");
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({ secret: "SECRET_NE_DOIT_PAS_APPARAITRE", expires_in: 3600 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }));
        const logs = [];
        try {
            await mod.checkMypvitConnections((m) => logs.push(m), (m) => logs.push(m));
        }
        finally {
            globalThis.fetch = realFetch;
        }
        strict_1.default.equal(logs.length, 1);
        strict_1.default.ok(logs[0].includes("connexion OK"));
        strict_1.default.equal(logs.join("\n").includes("SECRET_NE_DOIT_PAS_APPARAITRE"), false);
    });
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
// Fichier séparé : chaque fichier de test a son propre processus, donc pas de clé en cache venue d'un autre test
process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "ACC_STARTUP1";
process.env.MYPVIT_URLCODE_RENEW_SECRET = "RENEW1";
process.env.MYPVIT_API_PASSWORD = "pw";
process.env.MYPVIT_RECEPTION_URL_CODE = "RECV1";
process.env.MYPVIT_CALLBACK_URL_CODE = "CB1";
(0, node_test_1.describe)("contrôle de connexion MyPVit au démarrage : échec", () => {
    (0, node_test_1.test)("échec : le journal indique l'opérateur et la cause", async () => {
        const mod = await import("./mypvit.client");
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('{"error":"CONSTRAINT_VIOLATION"}', { status: 422 }));
        const warnings = [];
        try {
            await mod.checkMypvitConnections(() => { }, (m) => warnings.push(m));
        }
        finally {
            globalThis.fetch = realFetch;
        }
        strict_1.default.equal(warnings.length, 1);
        strict_1.default.ok(warnings[0].includes("AIRTEL_MONEY") && warnings[0].includes("ÉCHEC"));
    });
});

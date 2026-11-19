"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
// Configuration minimale AVANT l'import du client (l'environnement est lu à l'import)
process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "ACC_TEST_AIRTEL";
process.env.MYPVIT_URLCODE_RENEW_SECRET = "RENEW1";
process.env.MYPVIT_API_PASSWORD = "pw";
process.env.MYPVIT_RECEPTION_URL_CODE = "RECV1";
process.env.MYPVIT_CALLBACK_URL_CODE = "CB1";
(0, node_test_1.describe)("clé secrète MyPVit : demandes concurrentes", () => {
    (0, node_test_1.test)("deux appels simultanés pour le même compte déclenchent UN seul renouvellement", async () => {
        const mod = await import("./mypvit.client");
        let renewals = 0;
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url) => {
            if (String(url).includes("renew-secret")) {
                renewals++;
                await new Promise((r) => setTimeout(r, 20));
                return new Response(JSON.stringify({ secret: "SECRET_CONCURRENT", expires_in: 3600 }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response("{}", { status: 404 });
        });
        try {
            const [a, b] = await Promise.all([mod.getSecret("AIRTEL_MONEY"), mod.getSecret("AIRTEL_MONEY")]);
            strict_1.default.equal(a, "SECRET_CONCURRENT");
            strict_1.default.equal(b, "SECRET_CONCURRENT");
            strict_1.default.equal(renewals, 1);
        }
        finally {
            globalThis.fetch = realFetch;
        }
    });
});

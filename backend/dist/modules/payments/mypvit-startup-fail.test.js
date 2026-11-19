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
// Fichier séparé : chaque fichier de test a son propre processus, donc pas de clé en cache venue d'un autre test
process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "ACC_STARTUP1";
process.env.MYPVIT_URLCODE_RENEW_SECRET = "RENEW1";
process.env.MYPVIT_API_PASSWORD = "pw";
process.env.MYPVIT_RECEPTION_URL_CODE = "RECV1";
process.env.MYPVIT_CALLBACK_URL_CODE = "CB1";
(0, node_test_1.describe)("contrôle de connexion MyPVit au démarrage : échec", () => {
    (0, node_test_1.test)("échec : le journal indique l'opérateur et la cause", async () => {
        const mod = await Promise.resolve().then(() => __importStar(require("./mypvit.client")));
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

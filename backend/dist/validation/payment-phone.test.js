"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const schemas_1 = require("./schemas");
(0, node_test_1.describe)("numéro envoyé à MyPVit pour un remboursement", () => {
    (0, node_test_1.test)("format international gabonais ramené au format local (077000000)", () => {
        const r = schemas_1.payRepaymentSchema.parse({ amount: 1000, phone: "+241 77 00 00 00" });
        strict_1.default.equal(r.phone, "077000000");
    });
    (0, node_test_1.test)("format court sans indicatif accepté et normalisé", () => {
        const r = schemas_1.payRepaymentSchema.parse({ amount: 1000, phone: "77000000" });
        strict_1.default.equal(r.phone, "077000000");
    });
    (0, node_test_1.test)("numéro absent accepté (paiement par carte)", () => {
        const r = schemas_1.payRepaymentSchema.parse({ amount: 1000 });
        strict_1.default.equal(r.phone, undefined);
    });
});
(0, node_test_1.describe)("messages de réception de la clé MyPVit", () => {
    (0, node_test_1.test)("l'erreur indique la vraie route de réception, sans /api/webhooks", () => {
        const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(process.cwd(), "src/modules/payments/mypvit.client.ts"), "utf8");
        strict_1.default.equal(src.includes("/api/webhooks"), false);
        strict_1.default.equal(src.includes("POST /api/payments/mypvit/secret"), true);
    });
});

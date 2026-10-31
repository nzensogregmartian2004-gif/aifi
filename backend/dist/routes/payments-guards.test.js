"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const schemas_1 = require("../validation/schemas");
const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(process.cwd(), "src/routes/admin.routes.ts"), "utf8");
function routeSlice(header, length = 400) {
    const i = src.indexOf(header);
    strict_1.default.ok(i >= 0, `route introuvable : ${header}`);
    return src.slice(i, i + length);
}
(0, node_test_1.describe)("confirmation manuelle des paiements", () => {
    (0, node_test_1.test)("liste des paiements en attente : route présente", () => {
        strict_1.default.ok(routeSlice('router.get("/payments/pending"').includes('status: "PENDING"'));
    });
    (0, node_test_1.test)("confirmation : valide la référence et passe par le chemin atomique", () => {
        const block = routeSlice('router.post("/payments/:id/confirm"');
        strict_1.default.ok(block.includes("validateBody(confirmPaymentSchema)"));
        strict_1.default.ok(block.includes("confirmPaymentManually"));
    });
    (0, node_test_1.test)("rejet : passe par le chemin atomique, avec motif optionnel", () => {
        const block = routeSlice('router.post("/payments/:id/reject"');
        strict_1.default.ok(block.includes("validateBody(rejectPaymentSchema)"));
        strict_1.default.ok(block.includes("rejectPaymentManually"));
    });
    (0, node_test_1.test)("une référence vide ou trop courte est refusée", () => {
        strict_1.default.equal(schemas_1.confirmPaymentSchema.safeParse({ providerReference: "" }).success, false);
        strict_1.default.equal(schemas_1.confirmPaymentSchema.safeParse({ providerReference: "ab" }).success, false);
        strict_1.default.equal(schemas_1.confirmPaymentSchema.safeParse({ providerReference: "   " }).success, false);
        strict_1.default.equal(schemas_1.confirmPaymentSchema.safeParse({ providerReference: "MP123456" }).success, true);
    });
    (0, node_test_1.test)("le motif de rejet est optionnel", () => {
        strict_1.default.equal(schemas_1.rejectPaymentSchema.safeParse({}).success, true);
    });
});

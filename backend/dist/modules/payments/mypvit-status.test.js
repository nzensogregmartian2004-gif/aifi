"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mypvit_client_1 = require("./mypvit.client");
(0, node_test_1.describe)("vérification de statut MyPVit (conforme à la collection officielle)", () => {
    (0, node_test_1.test)("requête GET avec transactionId MyPVit, compte et type d'opération en paramètres", () => {
        const { url } = (0, mypvit_client_1.buildStatusRequest)("PAY23102400001", "ACC_1XXXXXXXX", "PAYMENT");
        const parsed = new URL(url);
        strict_1.default.equal(parsed.pathname.endsWith("/status"), true);
        strict_1.default.equal(parsed.searchParams.get("transactionId"), "PAY23102400001");
        strict_1.default.equal(parsed.searchParams.get("accountOperationCode"), "ACC_1XXXXXXXX");
        strict_1.default.equal(parsed.searchParams.get("transactionOperation"), "PAYMENT");
    });
    (0, node_test_1.test)("n'envoie jamais notre référence marchande à la place de l'identifiant MyPVit", () => {
        const { url } = (0, mypvit_client_1.buildStatusRequest)("PAY23102400001", "ACC_1XXXXXXXX", "PAYMENT");
        strict_1.default.equal(url.includes("REF"), false);
    });
    (0, node_test_1.test)("lit le statut de la réponse officielle (SUCCESS)", () => {
        const officialExample = {
            date: "23/10/2024 12:39:08",
            status: "SUCCESS",
            amount: 150,
            fees: 3.5,
            operator: "AIRTEL_MONEY",
            merchant_reference_id: "REF1234567890",
            customer_account_number: "074111111",
            merchant_operation_account_code: "ACC_1XXXXXXXX",
        };
        strict_1.default.equal((0, mypvit_client_1.parseStatusResponse)(officialExample), "SUCCESS");
    });
    (0, node_test_1.test)("statuts FAILED et PENDING reconnus, insensibles à la casse", () => {
        strict_1.default.equal((0, mypvit_client_1.parseStatusResponse)({ status: "failed" }), "FAILED");
        strict_1.default.equal((0, mypvit_client_1.parseStatusResponse)({ status: "Pending" }), "PENDING");
    });
    (0, node_test_1.test)("réponse sans statut reconnu : null, jamais une supposition", () => {
        strict_1.default.equal((0, mypvit_client_1.parseStatusResponse)({ status: "ON_HOLD" }), null);
        strict_1.default.equal((0, mypvit_client_1.parseStatusResponse)({}), null);
        strict_1.default.equal((0, mypvit_client_1.parseStatusResponse)(null), null);
    });
});

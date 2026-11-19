"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const retry_1 = require("./retry");
const conflict = () => Object.assign(new Error("conflit"), { code: "P2034" });
(0, node_test_1.describe)("nouvel essai sur conflit de transaction", () => {
    (0, node_test_1.test)("reconnaît un conflit P2034 et un conflit PostgreSQL 40001", () => {
        strict_1.default.equal((0, retry_1.isSerializationConflict)({ code: "P2034" }), true);
        strict_1.default.equal((0, retry_1.isSerializationConflict)({ code: "40001" }), true);
        strict_1.default.equal((0, retry_1.isSerializationConflict)({ code: "P2002" }), false);
    });
    (0, node_test_1.test)("conflit deux fois puis succès : le résultat est renvoyé", async () => {
        let calls = 0;
        const result = await (0, retry_1.withSerializationRetry)(async () => {
            calls++;
            if (calls < 3)
                throw conflict();
            return "ok";
        }, 3);
        strict_1.default.equal(result, "ok");
        strict_1.default.equal(calls, 3);
    });
    (0, node_test_1.test)("une erreur métier n'est jamais rejouée", async () => {
        let calls = 0;
        await strict_1.default.rejects((0, retry_1.withSerializationRetry)(async () => {
            calls++;
            throw new Error("REPAYMENT_EXCEEDS_DUE");
        }, 3), /REPAYMENT_EXCEEDS_DUE/);
        strict_1.default.equal(calls, 1);
    });
    (0, node_test_1.test)("abandon après le nombre de tentatives", async () => {
        let calls = 0;
        await strict_1.default.rejects((0, retry_1.withSerializationRetry)(async () => {
            calls++;
            throw conflict();
        }, 3), (err) => err.code === "P2034");
        strict_1.default.equal(calls, 3);
    });
});

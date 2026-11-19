"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
(0, node_test_1.describe)("validation de compte atomique", () => {
    (0, node_test_1.test)("un compte déjà traité ne déclenche ni points ni bonus", async () => {
        process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
        const { validateAccount } = await import("./account-validation.service");
        const calls = [];
        const tx = {
            user: { updateMany: async () => { calls.push("lock"); return { count: 0 }; } },
        };
        const db = {
            $transaction: async (callback) => callback(tx),
        };
        await strict_1.default.rejects(() => validateAccount("user-1", "admin-1", db), /pas en attente de validation/);
        strict_1.default.deepEqual(calls, ["lock"]);
    });
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
(0, node_test_1.describe)("plafond engagé", () => {
    (0, node_test_1.test)("inclut les demandes DISBURSING dans le capital engagé", async () => {
        process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
        const { computeAvailableCeiling } = await import("./aid-request.service");
        let query;
        const db = {
            user: { findUniqueOrThrow: async () => ({ ceiling: 10000 }) },
            aidRequest: { findMany: async (args) => {
                    query = args;
                    return [{ amount: 4000, repayments: [{ amount: 500 }] }];
                } },
        };
        const available = await computeAvailableCeiling(db, "user-1");
        strict_1.default.deepEqual(query.where.status.in, ["PENDING", "ACCEPTED", "DISBURSING", "DISBURSED", "LATE"]);
        strict_1.default.equal(available, 6500);
    });
});

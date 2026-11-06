import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("plafond engagé", () => {
  test("inclut les demandes DISBURSING dans le capital engagé", async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
    const { computeAvailableCeiling } = await import("./aid-request.service");
    let query: any;
    const db: any = {
      user: { findUniqueOrThrow: async () => ({ ceiling: 10000 }) },
      aidRequest: { findMany: async (args: any) => {
        query = args;
        return [{ amount: 4000, repayments: [{ amount: 500 }] }];
      } },
    };
    const available = await computeAvailableCeiling(db, "user-1");
    assert.deepEqual(query.where.status.in, ["PENDING", "ACCEPTED", "DISBURSING", "DISBURSED", "LATE"]);
    assert.equal(available, 6500);
  });
});

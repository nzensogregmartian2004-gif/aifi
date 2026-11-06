import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("validation de compte atomique", () => {
  test("un compte déjà traité ne déclenche ni points ni bonus", async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
    const { validateAccount } = await import("./account-validation.service");
    const calls: string[] = [];
    const tx: any = {
      user: { updateMany: async () => { calls.push("lock"); return { count: 0 }; } },
    };
    const db: any = {
      $transaction: async (callback: (tx: any) => Promise<any>) => callback(tx),
    };
    await assert.rejects(() => validateAccount("user-1", "admin-1", db), /pas en attente de validation/);
    assert.deepEqual(calls, ["lock"]);
  });
});

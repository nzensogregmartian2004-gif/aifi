import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { withSerializationRetry, isSerializationConflict } from "./retry";

const conflict = () => Object.assign(new Error("conflit"), { code: "P2034" });

describe("nouvel essai sur conflit de transaction", () => {
  test("reconnaît un conflit P2034 et un conflit PostgreSQL 40001", () => {
    assert.equal(isSerializationConflict({ code: "P2034" }), true);
    assert.equal(isSerializationConflict({ code: "40001" }), true);
    assert.equal(isSerializationConflict({ code: "P2002" }), false);
  });
  test("conflit deux fois puis succès : le résultat est renvoyé", async () => {
    let calls = 0;
    const result = await withSerializationRetry(async () => {
      calls++;
      if (calls < 3) throw conflict();
      return "ok";
    }, 3);
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });
  test("une erreur métier n'est jamais rejouée", async () => {
    let calls = 0;
    await assert.rejects(
      withSerializationRetry(async () => {
        calls++;
        throw new Error("REPAYMENT_EXCEEDS_DUE");
      }, 3),
      /REPAYMENT_EXCEEDS_DUE/
    );
    assert.equal(calls, 1);
  });
  test("abandon après le nombre de tentatives", async () => {
    let calls = 0;
    await assert.rejects(
      withSerializationRetry(async () => {
        calls++;
        throw conflict();
      }, 3),
      (err: any) => err.code === "P2034"
    );
    assert.equal(calls, 3);
  });
});

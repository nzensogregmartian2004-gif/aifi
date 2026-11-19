import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parsePushEnabled } from "./push-settings-input";
import { AppError } from "../../errors";

describe("validation de pushEnabled (réglage notifications)", () => {
  test("accepte true et false (activation et désactivation)", () => {
    assert.equal(parsePushEnabled({ pushEnabled: true }), true);
    assert.equal(parsePushEnabled({ pushEnabled: false }), false);
  });

  test("refuse les valeurs non booléennes : jamais d'activation par erreur", () => {
    for (const body of [{ pushEnabled: "true" }, { pushEnabled: 1 }, { pushEnabled: null }, {}, null, undefined]) {
      assert.throws(
        () => parsePushEnabled(body),
        (err: unknown) => err instanceof AppError && (err as AppError).code === "INVALID_SETTING",
        `doit refuser ${JSON.stringify(body)}`
      );
    }
  });
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Les variables sont lues à l'import : on les fixe AVANT d'importer le module
process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "  [ACC_TEST1]  ";
process.env.MYPVIT_URLCODE_RENEW_SECRET = '"RS1"';
process.env.MYPVIT_CALLBACK_URL_CODE = " CB1 ";
process.env.MYPVIT_API_PASSWORD = "  pa&ss#1  ";

describe("configuration MyPVit : valeurs collées dans Render", () => {
  test("espaces, guillemets et crochets parasites retirés des codes", async () => {
    const { env } = await import("./env");
    assert.equal(env.mypvit.accounts.AIRTEL_MONEY, "ACC_TEST1");
    assert.equal(env.mypvit.urlCodes.renewSecret, "RS1");
    assert.equal(env.mypvit.callbackUrlCode, "CB1");
  });
  test("le mot de passe garde ses caractères : seuls les espaces en bordure sont retirés", async () => {
    const { env } = await import("./env");
    assert.equal(env.mypvit.apiPassword, "pa&ss#1");
  });
  test("un code valide est reconnu par la fonction d'avertissement", async () => {
    const { mypvitCodeWarnings, cleanCode } = await import("./env");
    assert.equal(cleanCode("ACC_69D6187BBCE15"), "ACC_69D6187BBCE15");
    assert.deepEqual(mypvitCodeWarnings({ X: "ACC_69D6187BBCE15" }), []);
    const warnings = mypvitCodeWarnings({ MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL: "ACC 12/3" });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes("ACC 12/3"), false, "la valeur ne doit jamais apparaître dans l'avertissement");
  });
});

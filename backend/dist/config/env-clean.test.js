"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
// Les variables sont lues à l'import : on les fixe AVANT d'importer le module
process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "  [ACC_TEST1]  ";
process.env.MYPVIT_URLCODE_RENEW_SECRET = '"RS1"';
process.env.MYPVIT_CALLBACK_URL_CODE = " CB1 ";
process.env.MYPVIT_API_PASSWORD = "  pa&ss#1  ";
(0, node_test_1.describe)("configuration MyPVit : valeurs collées dans Render", () => {
    (0, node_test_1.test)("espaces, guillemets et crochets parasites retirés des codes", async () => {
        const { env } = await import("./env");
        strict_1.default.equal(env.mypvit.accounts.AIRTEL_MONEY, "ACC_TEST1");
        strict_1.default.equal(env.mypvit.urlCodes.renewSecret, "RS1");
        strict_1.default.equal(env.mypvit.callbackUrlCode, "CB1");
    });
    (0, node_test_1.test)("le mot de passe garde ses caractères : seuls les espaces en bordure sont retirés", async () => {
        const { env } = await import("./env");
        strict_1.default.equal(env.mypvit.apiPassword, "pa&ss#1");
    });
    (0, node_test_1.test)("un code valide est reconnu par la fonction d'avertissement", async () => {
        const { mypvitCodeWarnings, cleanCode } = await import("./env");
        strict_1.default.equal(cleanCode("ACC_69D6187BBCE15"), "ACC_69D6187BBCE15");
        strict_1.default.deepEqual(mypvitCodeWarnings({ X: "ACC_69D6187BBCE15" }), []);
        const warnings = mypvitCodeWarnings({ MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL: "ACC 12/3" });
        strict_1.default.equal(warnings.length, 1);
        strict_1.default.equal(warnings[0].includes("ACC 12/3"), false, "la valeur ne doit jamais apparaître dans l'avertissement");
    });
});

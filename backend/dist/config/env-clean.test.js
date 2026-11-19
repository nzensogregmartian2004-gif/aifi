"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
        const { env } = await Promise.resolve().then(() => __importStar(require("./env")));
        strict_1.default.equal(env.mypvit.accounts.AIRTEL_MONEY, "ACC_TEST1");
        strict_1.default.equal(env.mypvit.urlCodes.renewSecret, "RS1");
        strict_1.default.equal(env.mypvit.callbackUrlCode, "CB1");
    });
    (0, node_test_1.test)("le mot de passe garde ses caractères : seuls les espaces en bordure sont retirés", async () => {
        const { env } = await Promise.resolve().then(() => __importStar(require("./env")));
        strict_1.default.equal(env.mypvit.apiPassword, "pa&ss#1");
    });
    (0, node_test_1.test)("un code valide est reconnu par la fonction d'avertissement", async () => {
        const { mypvitCodeWarnings, cleanCode } = await Promise.resolve().then(() => __importStar(require("./env")));
        strict_1.default.equal(cleanCode("ACC_69D6187BBCE15"), "ACC_69D6187BBCE15");
        strict_1.default.deepEqual(mypvitCodeWarnings({ X: "ACC_69D6187BBCE15" }), []);
        const warnings = mypvitCodeWarnings({ MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL: "ACC 12/3" });
        strict_1.default.equal(warnings.length, 1);
        strict_1.default.equal(warnings[0].includes("ACC 12/3"), false, "la valeur ne doit jamais apparaître dans l'avertissement");
    });
});

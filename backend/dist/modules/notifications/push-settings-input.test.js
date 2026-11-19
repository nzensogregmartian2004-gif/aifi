"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const push_settings_input_1 = require("./push-settings-input");
const errors_1 = require("../../errors");
(0, node_test_1.describe)("validation de pushEnabled (réglage notifications)", () => {
    (0, node_test_1.test)("accepte true et false (activation et désactivation)", () => {
        strict_1.default.equal((0, push_settings_input_1.parsePushEnabled)({ pushEnabled: true }), true);
        strict_1.default.equal((0, push_settings_input_1.parsePushEnabled)({ pushEnabled: false }), false);
    });
    (0, node_test_1.test)("refuse les valeurs non booléennes : jamais d'activation par erreur", () => {
        for (const body of [{ pushEnabled: "true" }, { pushEnabled: 1 }, { pushEnabled: null }, {}, null, undefined]) {
            strict_1.default.throws(() => (0, push_settings_input_1.parsePushEnabled)(body), (err) => err instanceof errors_1.AppError && err.code === "INVALID_SETTING", `doit refuser ${JSON.stringify(body)}`);
        }
    });
});

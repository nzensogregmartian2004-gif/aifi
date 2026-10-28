"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const phone_1 = require("./phone");
(0, node_test_1.describe)("normalizePhone : toutes les saisies donnent la même forme", () => {
    const cases = [
        ["077000000", "077000000"],
        ["77000000", "077000000"],
        ["+24177000000", "077000000"],
        ["+241 77 00 00 00", "077000000"],
        ["+241 077 00 00 00", "077000000"],
        ["00241 77 00 00 00", "077000000"],
        ["241077000000", "077000000"],
        ["+33 6 12 34 56 78", "+33612345678"],
    ];
    for (const [raw, expected] of cases) {
        (0, node_test_1.test)(`${raw} -> ${expected}`, () => {
            strict_1.default.equal((0, phone_1.normalizePhone)(raw), expected);
        });
    }
});
(0, node_test_1.describe)("canonicalStoredPhone : valeurs déjà enregistrées", () => {
    (0, node_test_1.test)("ancienne forme 0077000000 (bug du « 0 » après l'indicatif)", () => {
        strict_1.default.equal((0, phone_1.canonicalStoredPhone)("0077000000"), "077000000");
    });
    (0, node_test_1.test)("+241077000000 stocké brut par le seed", () => {
        strict_1.default.equal((0, phone_1.canonicalStoredPhone)("+241077000000"), "077000000");
    });
    (0, node_test_1.test)("forme déjà canonique inchangée", () => {
        strict_1.default.equal((0, phone_1.canonicalStoredPhone)("077000000"), "077000000");
    });
});

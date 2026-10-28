"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const templates_1 = require("./templates");
const i18n_1 = require("./i18n");
(0, node_test_1.describe)("rendu des notifications", () => {
    (0, node_test_1.test)("français : paramètres remplacés", () => {
        strict_1.default.equal((0, templates_1.renderNotification)("reminder_days", { amount: 5000, days: 2 }, "fr"), "Ton remboursement de 5000 FCFA arrive à échéance dans 2 jour(s).");
    });
    (0, node_test_1.test)("anglais : texte traduit", () => {
        strict_1.default.equal((0, templates_1.renderNotification)("reminder_days", { amount: 5000, days: 2 }, "en"), "Your repayment of 5000 FCFA is due in 2 day(s).");
    });
    (0, node_test_1.test)("langue inconnue : repli sur le français", () => {
        strict_1.default.equal((0, templates_1.normalizeLang)("de"), "fr");
        strict_1.default.equal((0, templates_1.normalizeLang)(undefined), "fr");
        strict_1.default.equal((0, templates_1.normalizeLang)("pt"), "pt");
    });
    (0, node_test_1.test)("chaque modèle existe dans les cinq langues", () => {
        for (const lang of ["fr", "en", "ar", "pt", "es"]) {
            for (const type of Object.keys(templates_1.TEMPLATES)) {
                strict_1.default.ok(i18n_1.LOCALES[lang]?.[type], `${lang}.${type} manquant`);
            }
        }
    });
    (0, node_test_1.test)("paramètre absent : rendu sans erreur", () => {
        strict_1.default.equal((0, templates_1.renderNotification)("admin_client_message", {}, "fr"), " a envoyé un message.");
    });
});

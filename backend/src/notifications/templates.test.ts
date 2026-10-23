import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderNotification, normalizeLang, TEMPLATES } from "./templates";
import { LOCALES } from "./i18n";

describe("rendu des notifications", () => {
  test("français : paramètres remplacés", () => {
    assert.equal(
      renderNotification("reminder_days", { amount: 5000, days: 2 }, "fr"),
      "Ton remboursement de 5000 FCFA arrive à échéance dans 2 jour(s)."
    );
  });
  test("anglais : texte traduit", () => {
    assert.equal(
      renderNotification("reminder_days", { amount: 5000, days: 2 }, "en"),
      "Your repayment of 5000 FCFA is due in 2 day(s)."
    );
  });
  test("langue inconnue : repli sur le français", () => {
    assert.equal(normalizeLang("de"), "fr");
    assert.equal(normalizeLang(undefined), "fr");
    assert.equal(normalizeLang("pt"), "pt");
  });
  test("chaque modèle existe dans les cinq langues", () => {
    for (const lang of ["fr", "en", "ar", "pt", "es"]) {
      for (const type of Object.keys(TEMPLATES)) {
        assert.ok(LOCALES[lang]?.[type], `${lang}.${type} manquant`);
      }
    }
  });
  test("paramètre absent : rendu sans erreur", () => {
    assert.equal(renderNotification("admin_client_message", {}, "fr"), " a envoyé un message.");
  });
});

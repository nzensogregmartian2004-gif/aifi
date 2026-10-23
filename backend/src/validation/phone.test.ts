import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, canonicalStoredPhone } from "./phone";

describe("normalizePhone : toutes les saisies donnent la même forme", () => {
  const cases: [string, string][] = [
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
    test(`${raw} -> ${expected}`, () => {
      assert.equal(normalizePhone(raw), expected);
    });
  }
});

describe("canonicalStoredPhone : valeurs déjà enregistrées", () => {
  test("ancienne forme 0077000000 (bug du « 0 » après l'indicatif)", () => {
    assert.equal(canonicalStoredPhone("0077000000"), "077000000");
  });
  test("+241077000000 stocké brut par le seed", () => {
    assert.equal(canonicalStoredPhone("+241077000000"), "077000000");
  });
  test("forme déjà canonique inchangée", () => {
    assert.equal(canonicalStoredPhone("077000000"), "077000000");
  });
});

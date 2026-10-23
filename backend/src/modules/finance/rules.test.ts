import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { effectivePoints, tierCeilingFor, availableCeiling, planRepayment } from "./rules";

const TIERS = [
  { minPoints: 0, ceiling: 0 },
  { minPoints: 100, ceiling: 10000 },
  { minPoints: 150, ceiling: 15000 },
  { minPoints: 180, ceiling: 25000 },
  { minPoints: 240, ceiling: 60000 },
];

describe("points retenus pour le plafond", () => {
  test("sans AIFI+, les points sont plafonnés à freePointsCap", () => {
    assert.equal(effectivePoints(240, false, 150), 150);
    assert.equal(effectivePoints(120, false, 150), 120);
  });
  test("avec AIFI+, les points ne sont pas plafonnés", () => {
    assert.equal(effectivePoints(240, true, 150), 240);
  });
});

describe("plafond selon le palier", () => {
  test("sans AIFI+, le plafond s'arrête au palier de 150 points", () => {
    assert.equal(tierCeilingFor(effectivePoints(240, false, 150), TIERS), 15000);
    assert.equal(tierCeilingFor(effectivePoints(999, false, 150), TIERS), 15000);
  });
  test("avec AIFI+, les paliers supérieurs sont accessibles", () => {
    assert.equal(tierCeilingFor(effectivePoints(240, true, 150), TIERS), 60000);
    assert.equal(tierCeilingFor(effectivePoints(185, true, 150), TIERS), 25000);
  });
  test("en dessous du premier palier utile : 0", () => {
    assert.equal(tierCeilingFor(effectivePoints(-5, false, 150), TIERS), 0);
  });
  test("un palier ajouté par l'admin est pris en compte", () => {
    const withExtra = [...TIERS, { minPoints: 120, ceiling: 12000 }];
    assert.equal(tierCeilingFor(120, withExtra), 12000);
  });
});

describe("plafond disponible", () => {
  test("une demande en attente consomme déjà le plafond", () => {
    assert.equal(availableCeiling(60000, [{ amount: 50000, repaid: 0 }]), 10000);
  });
  test("les remboursements libèrent du plafond", () => {
    assert.equal(availableCeiling(60000, [{ amount: 50000, repaid: 20000 }]), 30000);
  });
  test("plusieurs demandes au-delà du plafond donnent un solde négatif", () => {
    const rows = [{ amount: 50000, repaid: 0 }, { amount: 50000, repaid: 0 }];
    assert.equal(availableCeiling(60000, rows), -40000);
  });
});

describe("remboursement", () => {
  test("paiement partiel", () => {
    const p = planRepayment(10000, 0, 4000);
    assert.equal(p.remainingAfter, 6000);
    assert.equal(p.isPartial, true);
    assert.equal(p.fullyRepaid, false);
  });
  test("solde complet", () => {
    const p = planRepayment(10000, 4000, 6000);
    assert.equal(p.remainingAfter, 0);
    assert.equal(p.isPartial, false);
    assert.equal(p.fullyRepaid, true);
  });
  test("trop-perçu refusé", () => {
    assert.throws(() => planRepayment(10000, 4000, 7000), /dépasse/);
  });
  test("montant nul refusé", () => {
    assert.throws(() => planRepayment(10000, 0, 0), /positif/);
  });
  test("des paiements successifs ne dépassent jamais le dû", () => {
    let repaid = 0;
    for (const amount of [3000, 3000, 4000]) {
      repaid += planRepayment(10000, repaid, amount).remainingAfter === 0 ? amount : amount;
    }
    assert.equal(repaid, 10000);
    assert.throws(() => planRepayment(10000, repaid, 1), /dépasse/);
  });
});

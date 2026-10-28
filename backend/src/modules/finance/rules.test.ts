import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePoints,
  tierCeilingFor,
  availableCeiling,
  planRepayment,
  lateState,
  dailyInterest,
  surchargeFor,
  flexibleAmountDue,
  assertDueChoice,
  calendarDaysBetween,
  sameLocalDay,
  isSettled,
  roundToFranc,
  maxChoosableDays,
  dueDateChoiceRange,
} from "./rules";

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
  test("les erreurs binaires de virgule flottante ne bloquent pas le solde", () => {
    const p = planRepayment(0.3, 0.1, 0.2);
    assert.equal(p.fullyRepaid, true);
    assert.equal(p.remainingAfter, 0);
  });
  test("isSettled : seul un reste nul est soldé", () => {
    assert.equal(isSettled(0), true);
    assert.equal(isSettled(0.0000001), true);
    assert.equal(isSettled(0.5), false);
  });
});

describe("arrondi au franc le plus proche", () => {
  test("10 000,1 et 10 000,2 deviennent 10 000", () => {
    assert.equal(roundToFranc(10000.1), 10000);
    assert.equal(roundToFranc(10000.2), 10000);
  });
  test("5 000,9 devient 5 001", () => {
    assert.equal(roundToFranc(5000.9), 5001);
  });
  test("un montant déjà entier ne change pas", () => {
    assert.equal(roundToFranc(6650), 6650);
  });
});

// ---------------------------------------------------------------------------
// Retards : grâce, puis majoration et pénalité de points (fuseau Libreville, UTC+1)
// ---------------------------------------------------------------------------

const DUE = new Date("2026-10-10T14:00:00Z"); // 15:00 à Libreville, 10 octobre
const day = (n: number) => new Date(Date.UTC(2026, 9, 10 + n, 6, 0, 0)); // 07:00 à Libreville

describe("jours calendaires à Libreville", () => {
  test("23h30 UTC le 10 = 00h30 le 11 à Libreville : le jour compte déjà pour le 11", () => {
    const d = new Date("2026-10-10T23:30:00Z");
    assert.equal(sameLocalDay(d, new Date("2026-10-11T00:10:00Z")), true);
  });
  test("le changement de jour se fait à minuit heure de Libreville, pas à minuit UTC", () => {
    const due = new Date("2026-10-10T23:30:00Z");
    const now = new Date("2026-10-11T22:30:00Z");
    assert.equal(calendarDaysBetween(due, now), 0);
    assert.equal(lateState(due, now, 1).phase, "ON_TIME");
  });
});

describe("état de retard", () => {
  test("le jour de l'échéance n'est jamais en retard", () => {
    assert.equal(lateState(DUE, day(0), 1).phase, "ON_TIME");
  });
  test("client simple (1 jour de grâce) : le lendemain est en grâce, sans pénalité", () => {
    const s = lateState(DUE, day(1), 1);
    assert.equal(s.phase, "GRACE");
    assert.equal(s.graceDaysLeft, 1);
    assert.equal(s.lateDays, 0);
  });
  test("client simple : après la grâce, 1 jour de retard", () => {
    const s = lateState(DUE, day(2), 1);
    assert.equal(s.phase, "LATE");
    assert.equal(s.lateDays, 1);
  });
  test("AIFI+ (3 jours de grâce) : 3 jours de grâce, puis retard", () => {
    assert.equal(lateState(DUE, day(1), 3).graceDaysLeft, 3);
    assert.equal(lateState(DUE, day(3), 3).graceDaysLeft, 1);
    assert.equal(lateState(DUE, day(3), 3).phase, "GRACE");
    const late = lateState(DUE, day(4), 3);
    assert.equal(late.phase, "LATE");
    assert.equal(late.lateDays, 1);
  });
  test("le nombre de jours de retard augmente chaque jour", () => {
    assert.equal(lateState(DUE, day(7), 1).lateDays, 6);
  });
  test("le soir du premier jour de grâce reste en grâce", () => {
    const soir = new Date(Date.UTC(2026, 9, 11, 22, 0, 0));
    assert.equal(lateState(DUE, soir, 1).phase, "GRACE");
  });
});

describe("majoration proportionnelle aux intérêts de la grille", () => {
  test("exemple validé : 1 000 FCFA -> 1 330 FCFA sur 3 jours, 110 FCFA par jour de retard", () => {
    assert.equal(dailyInterest(330, 3), 110);
    assert.equal(surchargeFor(330, 3, 1), 110);
    assert.equal(surchargeFor(330, 3, 2), 220);
  });
  test("exemple validé : 5 000 FCFA sur 15 jours, 110 FCFA par jour de retard", () => {
    assert.equal(surchargeFor(1650, 15, 1), 110);
    assert.equal(surchargeFor(1650, 15, 0), 0);
  });
  test("calcul exact puis arrondi unique du total : 1 000 FCFA sur 7 jours, 1 jour de retard -> 1 377", () => {
    assert.equal(surchargeFor(330, 7, 1), 330 / 7);
    assert.equal(roundToFranc(1330 + surchargeFor(330, 7, 1)), 1377);
  });
  test("pas d'accumulation d'écarts : 3 jours de retard -> 1 471 FCFA (et non 1 330 + 3 × 47)", () => {
    assert.equal(roundToFranc(1330 + surchargeFor(330, 7, 3)), 1471);
  });
});

describe("choix de la date de remboursement", () => {
  test("5 000 FCFA sur 25 jours (grille 15 = 6 650) : 6 650 + 110 × 10 = 7 750", () => {
    assert.equal(flexibleAmountDue(5000, 6650, 15, 25), 7750);
  });
  test("choisir la durée de la grille donne le montant de la grille", () => {
    assert.equal(flexibleAmountDue(5000, 6650, 15, 15), 6650);
  });
  test("une date plus courte que la grille garde le montant de la grille, sans réduction", () => {
    assert.equal(flexibleAmountDue(5000, 6650, 15, 10), 6650);
    assert.equal(flexibleAmountDue(5000, 6650, 15, 3), 6650);
  });
  test("le total choisi est arrondi au franc : 1 000 FCFA (grille 7 = 1 330), 10 jours -> 1 471", () => {
    assert.equal(flexibleAmountDue(1000, 1330, 7, 10), 1471);
  });
  test("maximum = double de la grille : 15 -> 30, 30 -> 60", () => {
    assert.equal(maxChoosableDays(15), 30);
    assert.equal(maxChoosableDays(30), 60);
  });
  test("la plage suit la grille : passer la grille à 13 jours donne un maximum de 26", () => {
    assert.equal(dueDateChoiceRange(13, 3).maxDays, 26);
  });
  test("sous le seuil de points, pas de choix de date", () => {
    assert.throws(
      () => assertDueChoice({ chosenDurationDays: 25, gridDurationDays: 15, points: 49, minPoints: 50, minDays: 3 }),
      (err: any) => err.code === "DUE_DATE_CHOICE_LOCKED"
    );
  });
  test("sous le seuil, garder la durée de la grille reste possible", () => {
    assert.doesNotThrow(() =>
      assertDueChoice({ chosenDurationDays: 15, gridDurationDays: 15, points: 0, minPoints: 50, minDays: 3 })
    );
  });
  test("à partir de 50 points : de 3 jours jusqu'au double de la grille", () => {
    assert.doesNotThrow(() => assertDueChoice({ chosenDurationDays: 3, gridDurationDays: 15, points: 50, minPoints: 50, minDays: 3 }));
    assert.doesNotThrow(() => assertDueChoice({ chosenDurationDays: 30, gridDurationDays: 15, points: 50, minPoints: 50, minDays: 3 }));
  });
  test("moins de 3 jours : refusé", () => {
    assert.throws(
      () => assertDueChoice({ chosenDurationDays: 2, gridDurationDays: 15, points: 84, minPoints: 50, minDays: 3 }),
      (err: any) => err.code === "DUE_DATE_OUT_OF_RANGE" && err.params.minDays === 3 && err.params.maxDays === 30
    );
  });
  test("plus du double de la grille : refusé (31 jours sur une grille de 15)", () => {
    assert.throws(
      () => assertDueChoice({ chosenDurationDays: 31, gridDurationDays: 15, points: 84, minPoints: 50, minDays: 3 }),
      (err: any) => err.code === "DUE_DATE_OUT_OF_RANGE"
    );
  });
  test("grille trop courte pour la plage (1 jour -> maximum 2 < minimum 3) : aucun choix possible", () => {
    assert.throws(
      () => assertDueChoice({ chosenDurationDays: 2, gridDurationDays: 1, points: 84, minPoints: 50, minDays: 3 }),
      (err: any) => err.code === "DUE_DATE_OUT_OF_RANGE"
    );
  });
  test("durée non entière refusée", () => {
    assert.throws(
      () => assertDueChoice({ chosenDurationDays: 16.5, gridDurationDays: 15, points: 84, minPoints: 50, minDays: 3 }),
      (err: any) => err.code === "DUE_DATE_OUT_OF_RANGE"
    );
  });
});

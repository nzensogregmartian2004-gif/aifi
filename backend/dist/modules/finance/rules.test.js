"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const rules_1 = require("./rules");
const TIERS = [
    { minPoints: 0, ceiling: 0 },
    { minPoints: 100, ceiling: 10000 },
    { minPoints: 150, ceiling: 15000 },
    { minPoints: 180, ceiling: 25000 },
    { minPoints: 240, ceiling: 60000 },
];
(0, node_test_1.describe)("points retenus pour le plafond", () => {
    (0, node_test_1.test)("sans AIFI+, les points sont plafonnés à freePointsCap", () => {
        strict_1.default.equal((0, rules_1.effectivePoints)(240, false, 150), 150);
        strict_1.default.equal((0, rules_1.effectivePoints)(120, false, 150), 120);
    });
    (0, node_test_1.test)("avec AIFI+, les points ne sont pas plafonnés", () => {
        strict_1.default.equal((0, rules_1.effectivePoints)(240, true, 150), 240);
    });
});
(0, node_test_1.describe)("plafond selon le palier", () => {
    (0, node_test_1.test)("sans AIFI+, le plafond s'arrête au palier de 150 points", () => {
        strict_1.default.equal((0, rules_1.tierCeilingFor)((0, rules_1.effectivePoints)(240, false, 150), TIERS), 15000);
        strict_1.default.equal((0, rules_1.tierCeilingFor)((0, rules_1.effectivePoints)(999, false, 150), TIERS), 15000);
    });
    (0, node_test_1.test)("avec AIFI+, les paliers supérieurs sont accessibles", () => {
        strict_1.default.equal((0, rules_1.tierCeilingFor)((0, rules_1.effectivePoints)(240, true, 150), TIERS), 60000);
        strict_1.default.equal((0, rules_1.tierCeilingFor)((0, rules_1.effectivePoints)(185, true, 150), TIERS), 25000);
    });
    (0, node_test_1.test)("en dessous du premier palier utile : 0", () => {
        strict_1.default.equal((0, rules_1.tierCeilingFor)((0, rules_1.effectivePoints)(-5, false, 150), TIERS), 0);
    });
    (0, node_test_1.test)("un palier ajouté par l'admin est pris en compte", () => {
        const withExtra = [...TIERS, { minPoints: 120, ceiling: 12000 }];
        strict_1.default.equal((0, rules_1.tierCeilingFor)(120, withExtra), 12000);
    });
});
(0, node_test_1.describe)("plafond disponible", () => {
    (0, node_test_1.test)("une demande en attente consomme déjà le plafond", () => {
        strict_1.default.equal((0, rules_1.availableCeiling)(60000, [{ amount: 50000, repaid: 0 }]), 10000);
    });
    (0, node_test_1.test)("les remboursements libèrent du plafond", () => {
        strict_1.default.equal((0, rules_1.availableCeiling)(60000, [{ amount: 50000, repaid: 20000 }]), 30000);
    });
    (0, node_test_1.test)("plusieurs demandes au-delà du plafond donnent un solde négatif", () => {
        const rows = [{ amount: 50000, repaid: 0 }, { amount: 50000, repaid: 0 }];
        strict_1.default.equal((0, rules_1.availableCeiling)(60000, rows), -40000);
    });
});
(0, node_test_1.describe)("remboursement", () => {
    (0, node_test_1.test)("paiement partiel", () => {
        const p = (0, rules_1.planRepayment)(10000, 0, 4000);
        strict_1.default.equal(p.remainingAfter, 6000);
        strict_1.default.equal(p.isPartial, true);
        strict_1.default.equal(p.fullyRepaid, false);
    });
    (0, node_test_1.test)("solde complet", () => {
        const p = (0, rules_1.planRepayment)(10000, 4000, 6000);
        strict_1.default.equal(p.remainingAfter, 0);
        strict_1.default.equal(p.isPartial, false);
        strict_1.default.equal(p.fullyRepaid, true);
    });
    (0, node_test_1.test)("trop-perçu refusé", () => {
        strict_1.default.throws(() => (0, rules_1.planRepayment)(10000, 4000, 7000), /dépasse/);
    });
    (0, node_test_1.test)("montant nul refusé", () => {
        strict_1.default.throws(() => (0, rules_1.planRepayment)(10000, 0, 0), /positif/);
    });
    (0, node_test_1.test)("des paiements successifs ne dépassent jamais le dû", () => {
        let repaid = 0;
        for (const amount of [3000, 3000, 4000]) {
            repaid += (0, rules_1.planRepayment)(10000, repaid, amount).remainingAfter === 0 ? amount : amount;
        }
        strict_1.default.equal(repaid, 10000);
        strict_1.default.throws(() => (0, rules_1.planRepayment)(10000, repaid, 1), /dépasse/);
    });
    (0, node_test_1.test)("les erreurs binaires de virgule flottante ne bloquent pas le solde", () => {
        const p = (0, rules_1.planRepayment)(0.3, 0.1, 0.2);
        strict_1.default.equal(p.fullyRepaid, true);
        strict_1.default.equal(p.remainingAfter, 0);
    });
    (0, node_test_1.test)("isSettled : seul un reste nul est soldé", () => {
        strict_1.default.equal((0, rules_1.isSettled)(0), true);
        strict_1.default.equal((0, rules_1.isSettled)(0.0000001), true);
        strict_1.default.equal((0, rules_1.isSettled)(0.5), false);
    });
});
(0, node_test_1.describe)("arrondi au franc le plus proche", () => {
    (0, node_test_1.test)("10 000,1 et 10 000,2 deviennent 10 000", () => {
        strict_1.default.equal((0, rules_1.roundToFranc)(10000.1), 10000);
        strict_1.default.equal((0, rules_1.roundToFranc)(10000.2), 10000);
    });
    (0, node_test_1.test)("5 000,9 devient 5 001", () => {
        strict_1.default.equal((0, rules_1.roundToFranc)(5000.9), 5001);
    });
    (0, node_test_1.test)("un montant déjà entier ne change pas", () => {
        strict_1.default.equal((0, rules_1.roundToFranc)(6650), 6650);
    });
});
// ---------------------------------------------------------------------------
// Retards : grâce, puis majoration et pénalité de points (fuseau Libreville, UTC+1)
// ---------------------------------------------------------------------------
const DUE = new Date("2026-10-10T14:00:00Z"); // 15:00 à Libreville, 10 octobre
const day = (n) => new Date(Date.UTC(2026, 9, 10 + n, 6, 0, 0)); // 07:00 à Libreville
(0, node_test_1.describe)("jours calendaires à Libreville", () => {
    (0, node_test_1.test)("23h30 UTC le 10 = 00h30 le 11 à Libreville : le jour compte déjà pour le 11", () => {
        const d = new Date("2026-10-10T23:30:00Z");
        strict_1.default.equal((0, rules_1.sameLocalDay)(d, new Date("2026-10-11T00:10:00Z")), true);
    });
    (0, node_test_1.test)("le changement de jour se fait à minuit heure de Libreville, pas à minuit UTC", () => {
        const due = new Date("2026-10-10T23:30:00Z");
        const now = new Date("2026-10-11T22:30:00Z");
        strict_1.default.equal((0, rules_1.calendarDaysBetween)(due, now), 0);
        strict_1.default.equal((0, rules_1.lateState)(due, now, 1).phase, "ON_TIME");
    });
});
(0, node_test_1.describe)("état de retard", () => {
    (0, node_test_1.test)("le jour de l'échéance n'est jamais en retard", () => {
        strict_1.default.equal((0, rules_1.lateState)(DUE, day(0), 1).phase, "ON_TIME");
    });
    (0, node_test_1.test)("client simple (1 jour de grâce) : le lendemain est en grâce, sans pénalité", () => {
        const s = (0, rules_1.lateState)(DUE, day(1), 1);
        strict_1.default.equal(s.phase, "GRACE");
        strict_1.default.equal(s.graceDaysLeft, 1);
        strict_1.default.equal(s.lateDays, 0);
    });
    (0, node_test_1.test)("client simple : après la grâce, 1 jour de retard", () => {
        const s = (0, rules_1.lateState)(DUE, day(2), 1);
        strict_1.default.equal(s.phase, "LATE");
        strict_1.default.equal(s.lateDays, 1);
    });
    (0, node_test_1.test)("AIFI+ (3 jours de grâce) : 3 jours de grâce, puis retard", () => {
        strict_1.default.equal((0, rules_1.lateState)(DUE, day(1), 3).graceDaysLeft, 3);
        strict_1.default.equal((0, rules_1.lateState)(DUE, day(3), 3).graceDaysLeft, 1);
        strict_1.default.equal((0, rules_1.lateState)(DUE, day(3), 3).phase, "GRACE");
        const late = (0, rules_1.lateState)(DUE, day(4), 3);
        strict_1.default.equal(late.phase, "LATE");
        strict_1.default.equal(late.lateDays, 1);
    });
    (0, node_test_1.test)("le nombre de jours de retard augmente chaque jour", () => {
        strict_1.default.equal((0, rules_1.lateState)(DUE, day(7), 1).lateDays, 6);
    });
    (0, node_test_1.test)("le soir du premier jour de grâce reste en grâce", () => {
        const soir = new Date(Date.UTC(2026, 9, 11, 22, 0, 0));
        strict_1.default.equal((0, rules_1.lateState)(DUE, soir, 1).phase, "GRACE");
    });
});
(0, node_test_1.describe)("majoration proportionnelle aux intérêts de la grille", () => {
    (0, node_test_1.test)("exemple validé : 1 000 FCFA -> 1 330 FCFA sur 3 jours, 110 FCFA par jour de retard", () => {
        strict_1.default.equal((0, rules_1.dailyInterest)(330, 3), 110);
        strict_1.default.equal((0, rules_1.surchargeFor)(330, 3, 1), 110);
        strict_1.default.equal((0, rules_1.surchargeFor)(330, 3, 2), 220);
    });
    (0, node_test_1.test)("exemple validé : 5 000 FCFA sur 15 jours, 110 FCFA par jour de retard", () => {
        strict_1.default.equal((0, rules_1.surchargeFor)(1650, 15, 1), 110);
        strict_1.default.equal((0, rules_1.surchargeFor)(1650, 15, 0), 0);
    });
    (0, node_test_1.test)("calcul exact puis arrondi unique du total : 1 000 FCFA sur 7 jours, 1 jour de retard -> 1 377", () => {
        strict_1.default.equal((0, rules_1.surchargeFor)(330, 7, 1), 330 / 7);
        strict_1.default.equal((0, rules_1.roundToFranc)(1330 + (0, rules_1.surchargeFor)(330, 7, 1)), 1377);
    });
    (0, node_test_1.test)("pas d'accumulation d'écarts : 3 jours de retard -> 1 471 FCFA (et non 1 330 + 3 × 47)", () => {
        strict_1.default.equal((0, rules_1.roundToFranc)(1330 + (0, rules_1.surchargeFor)(330, 7, 3)), 1471);
    });
});
(0, node_test_1.describe)("choix de la date de remboursement", () => {
    (0, node_test_1.test)("5 000 FCFA sur 25 jours (grille 15 = 6 650) : 6 650 + 110 × 10 = 7 750", () => {
        strict_1.default.equal((0, rules_1.flexibleAmountDue)(5000, 6650, 15, 25), 7750);
    });
    (0, node_test_1.test)("choisir la durée de la grille donne le montant de la grille", () => {
        strict_1.default.equal((0, rules_1.flexibleAmountDue)(5000, 6650, 15, 15), 6650);
    });
    (0, node_test_1.test)("une date plus courte que la grille garde le montant de la grille, sans réduction", () => {
        strict_1.default.equal((0, rules_1.flexibleAmountDue)(5000, 6650, 15, 10), 6650);
        strict_1.default.equal((0, rules_1.flexibleAmountDue)(5000, 6650, 15, 3), 6650);
    });
    (0, node_test_1.test)("le total choisi est arrondi au franc : 1 000 FCFA (grille 7 = 1 330), 10 jours -> 1 471", () => {
        strict_1.default.equal((0, rules_1.flexibleAmountDue)(1000, 1330, 7, 10), 1471);
    });
    (0, node_test_1.test)("maximum = double de la grille : 15 -> 30, 30 -> 60", () => {
        strict_1.default.equal((0, rules_1.maxChoosableDays)(15), 30);
        strict_1.default.equal((0, rules_1.maxChoosableDays)(30), 60);
    });
    (0, node_test_1.test)("la plage suit la grille : passer la grille à 13 jours donne un maximum de 26", () => {
        strict_1.default.equal((0, rules_1.dueDateChoiceRange)(13, 3).maxDays, 26);
    });
    (0, node_test_1.test)("sous le seuil de points, pas de choix de date", () => {
        strict_1.default.throws(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 25, gridDurationDays: 15, points: 49, minPoints: 50, minDays: 3 }), (err) => err.code === "DUE_DATE_CHOICE_LOCKED");
    });
    (0, node_test_1.test)("sous le seuil, garder la durée de la grille reste possible", () => {
        strict_1.default.doesNotThrow(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 15, gridDurationDays: 15, points: 0, minPoints: 50, minDays: 3 }));
    });
    (0, node_test_1.test)("à partir de 50 points : de 3 jours jusqu'au double de la grille", () => {
        strict_1.default.doesNotThrow(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 3, gridDurationDays: 15, points: 50, minPoints: 50, minDays: 3 }));
        strict_1.default.doesNotThrow(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 30, gridDurationDays: 15, points: 50, minPoints: 50, minDays: 3 }));
    });
    (0, node_test_1.test)("moins de 3 jours : refusé", () => {
        strict_1.default.throws(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 2, gridDurationDays: 15, points: 84, minPoints: 50, minDays: 3 }), (err) => err.code === "DUE_DATE_OUT_OF_RANGE" && err.params.minDays === 3 && err.params.maxDays === 30);
    });
    (0, node_test_1.test)("plus du double de la grille : refusé (31 jours sur une grille de 15)", () => {
        strict_1.default.throws(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 31, gridDurationDays: 15, points: 84, minPoints: 50, minDays: 3 }), (err) => err.code === "DUE_DATE_OUT_OF_RANGE");
    });
    (0, node_test_1.test)("grille trop courte pour la plage (1 jour -> maximum 2 < minimum 3) : aucun choix possible", () => {
        strict_1.default.throws(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 2, gridDurationDays: 1, points: 84, minPoints: 50, minDays: 3 }), (err) => err.code === "DUE_DATE_OUT_OF_RANGE");
    });
    (0, node_test_1.test)("durée non entière refusée", () => {
        strict_1.default.throws(() => (0, rules_1.assertDueChoice)({ chosenDurationDays: 16.5, gridDurationDays: 15, points: 84, minPoints: 50, minDays: 3 }), (err) => err.code === "DUE_DATE_OUT_OF_RANGE");
    });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLEXIBLE_DUE_MAX_FACTOR = exports.APP_TIMEZONE = exports.AMOUNT_EPSILON = void 0;
exports.effectivePoints = effectivePoints;
exports.tierCeilingFor = tierCeilingFor;
exports.availableCeiling = availableCeiling;
exports.isSettled = isSettled;
exports.roundToFranc = roundToFranc;
exports.planRepayment = planRepayment;
exports.localDayIndex = localDayIndex;
exports.calendarDaysBetween = calendarDaysBetween;
exports.sameLocalDay = sameLocalDay;
exports.lateState = lateState;
exports.dailyInterest = dailyInterest;
exports.surchargeFor = surchargeFor;
exports.maxChoosableDays = maxChoosableDays;
exports.dueDateChoiceRange = dueDateChoiceRange;
exports.flexibleAmountDue = flexibleAmountDue;
exports.formatAmount = formatAmount;
exports.assertDueChoice = assertDueChoice;
const errors_1 = require("../../errors");
/**
 * Règles métier pures (sans accès à la base). Testées dans rules.test.ts.
 *
 * Arrondi : le montant dû est toujours un nombre entier de FCFA, arrondi au franc
 * le plus proche (10 000,2 -> 10 000 ; 5 000,9 -> 5 001). Les calculs intermédiaires
 * (majoration par jour, intérêts journaliers) restent exacts ; seul le total est arrondi,
 * une seule fois, pour éviter d'accumuler des écarts.
 */
/** Points retenus pour le plafond. Sans AIFI+, plafonnés à freePointsCap. */
function effectivePoints(points, isPremium, freePointsCap) {
    return isPremium ? points : Math.min(points, freePointsCap);
}
/** Plafond du palier le plus haut atteint par les points retenus (0 si aucun). */
function tierCeilingFor(effective, tiers) {
    let base = 0;
    let bestMin = -Infinity;
    for (const tier of tiers) {
        if (tier.minPoints <= effective && tier.minPoints > bestMin) {
            bestMin = tier.minPoints;
            base = tier.ceiling;
        }
    }
    return base;
}
/** Plafond disponible = plafond − capital encore dû sur les demandes engagées. Négatif = dépassement. */
function availableCeiling(ceiling, openRequests) {
    return ceiling - openRequests.reduce((sum, r) => sum + (r.amount - r.repaid), 0);
}
// ---------------------------------------------------------------------------
// Montants : tolérance binaire uniquement (0,1 + 0,2 ≠ 0,3 en virgule flottante).
// ---------------------------------------------------------------------------
exports.AMOUNT_EPSILON = 0.000001;
/** Vrai si un montant restant est nul (à la précision de calcul près). */
function isSettled(amountLeft) {
    return Math.abs(amountLeft) < exports.AMOUNT_EPSILON;
}
/** Arrondi au franc le plus proche : le montant dû est toujours un entier de FCFA. */
function roundToFranc(amount) {
    return Math.round(amount);
}
/** Vérifie qu'un remboursement est possible et calcule ce qui reste dû. */
function planRepayment(amountDue, alreadyRepaid, amount) {
    const remainingBefore = amountDue - alreadyRepaid;
    if (amount <= 0) {
        throw new errors_1.AppError("AMOUNT_NOT_POSITIVE", "Le montant du remboursement doit être positif");
    }
    if (amount > remainingBefore + exports.AMOUNT_EPSILON) {
        throw new errors_1.AppError("REPAYMENT_EXCEEDS_DUE", `Le remboursement (${amount}) dépasse le montant restant dû (${remainingBefore})`, { amount, remaining: remainingBefore });
    }
    const remainingAfter = isSettled(remainingBefore - amount) ? 0 : remainingBefore - amount;
    return {
        remainingBefore,
        remainingAfter,
        isPartial: remainingAfter > 0,
        fullyRepaid: remainingAfter === 0,
    };
}
// ---------------------------------------------------------------------------
// Calendrier : le jour se compte à Libreville (Gabon, UTC+1 toute l'année).
// ---------------------------------------------------------------------------
/** Fuseau de référence de l'application (Afrique centrale, UTC+1, sans heure d'été). */
exports.APP_TIMEZONE = "Africa/Libreville";
const APP_UTC_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Numéro du jour calendaire, à Libreville. */
function localDayIndex(d) {
    return Math.floor((d.getTime() + APP_UTC_OFFSET_MS) / DAY_MS);
}
/** Nombre de jours calendaires (Libreville) entre deux dates. 0 = même jour. */
function calendarDaysBetween(from, to) {
    return localDayIndex(to) - localDayIndex(from);
}
/** Vrai si les deux instants tombent le même jour calendaire à Libreville. */
function sameLocalDay(a, b) {
    return !!a && localDayIndex(a) === localDayIndex(b);
}
/**
 * État d'une demande à une date donnée. Le jour de l'échéance n'est jamais en retard.
 * Les `graceDays` jours qui suivent l'échéance ne donnent lieu à aucune pénalité.
 * Le premier jour après le sursis compte pour 1 jour de retard.
 */
function lateState(dueDate, now, graceDays) {
    const daysAfterDue = calendarDaysBetween(dueDate, now);
    if (daysAfterDue <= 0) {
        return { phase: "ON_TIME", graceDaysLeft: 0, lateDays: 0, daysAfterDue };
    }
    if (daysAfterDue <= graceDays) {
        return {
            phase: "GRACE",
            graceDaysLeft: graceDays - daysAfterDue + 1,
            lateDays: 0,
            daysAfterDue,
        };
    }
    return {
        phase: "LATE",
        graceDaysLeft: 0,
        lateDays: daysAfterDue - graceDays,
        daysAfterDue,
    };
}
/**
 * Intérêts journaliers : intérêts prévus par la grille divisés par la durée de la grille.
 * Ex. 1 000 FCFA -> 1 330 FCFA sur 3 jours : 330 / 3 = 110 FCFA par jour.
 * Valeur exacte (non arrondie) ; l'arrondi se fait sur le total dû.
 */
function dailyInterest(interestAmount, gridDurationDays) {
    if (gridDurationDays <= 0)
        return 0;
    return interestAmount / gridDurationDays;
}
/** Majoration exacte pour `lateDays` jours de retard (avant arrondi du total). */
function surchargeFor(interestAmount, gridDurationDays, lateDays) {
    if (gridDurationDays <= 0 || lateDays <= 0)
        return 0;
    return (interestAmount * lateDays) / gridDurationDays;
}
/** Durée maximale choisissable : le double de la durée de la grille (15 jours -> 30 jours, 30 -> 60). */
exports.FLEXIBLE_DUE_MAX_FACTOR = 2;
function maxChoosableDays(gridDurationDays) {
    return gridDurationDays * exports.FLEXIBLE_DUE_MAX_FACTOR;
}
/** Plage de durées choisissables pour une grille donnée. `allowed` = faux si la plage est vide. */
function dueDateChoiceRange(gridDurationDays, minDays) {
    const maxDays = maxChoosableDays(gridDurationDays);
    return { minDays, maxDays, allowed: maxDays >= minDays };
}
/**
 * Montant à rembourser selon la durée choisie (arrondi au franc le plus proche) :
 * - durée égale ou plus courte que la grille : on rembourse le montant de la grille, sans réduction ;
 * - durée plus longue : montant de la grille + intérêt journalier de la grille × jours en plus.
 * Ex. 5 000 FCFA, grille 15 jours (6 650 FCFA) : 25 jours -> 6 650 + 110 × 10 = 7 750 FCFA.
 */
function flexibleAmountDue(amount, gridAmountDue, gridDurationDays, chosenDurationDays) {
    if (gridDurationDays <= 0 || chosenDurationDays <= gridDurationDays)
        return gridAmountDue;
    const interest = gridAmountDue - amount;
    return roundToFranc(gridAmountDue + (interest / gridDurationDays) * (chosenDurationDays - gridDurationDays));
}
/** Affichage uniquement : montant entier avec séparateurs de milliers. */
function formatAmount(n) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(roundToFranc(n));
}
/**
 * Contrôle du choix de date.
 * - Sans choix, ou choix égal à la grille : rien à vérifier.
 * - Choisir une date exige le seuil de points de confiance (étape 50 par défaut).
 * - La durée choisie doit être un entier compris entre minDays (3) et le double de la grille.
 */
function assertDueChoice(params) {
    const { chosenDurationDays, gridDurationDays, points, minPoints, minDays } = params;
    if (chosenDurationDays === gridDurationDays)
        return;
    if (points < minPoints) {
        throw new errors_1.AppError("DUE_DATE_CHOICE_LOCKED", `Le choix de la date de remboursement est réservé aux clients ayant au moins ${minPoints} points de confiance.`, { minPoints });
    }
    const range = dueDateChoiceRange(gridDurationDays, minDays);
    if (!range.allowed || !Number.isInteger(chosenDurationDays) || chosenDurationDays < range.minDays || chosenDurationDays > range.maxDays) {
        throw new errors_1.AppError("DUE_DATE_OUT_OF_RANGE", `La durée doit être comprise entre ${range.minDays} et ${range.maxDays} jours.`, { minDays: range.minDays, maxDays: range.maxDays });
    }
}

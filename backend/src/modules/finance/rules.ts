import { AppError } from "../../errors";
/**
 * Règles métier pures (sans accès à la base). Testées dans rules.test.ts.
 *
 * Arrondi : le montant dû est toujours un nombre entier de FCFA, arrondi au franc
 * le plus proche (10 000,2 -> 10 000 ; 5 000,9 -> 5 001). Les calculs intermédiaires
 * (majoration par jour, intérêts journaliers) restent exacts ; seul le total est arrondi,
 * une seule fois, pour éviter d'accumuler des écarts.
 */

/** Points retenus pour le plafond. Sans AIFI+, plafonnés à freePointsCap. */
export function effectivePoints(points: number, isPremium: boolean, freePointsCap: number): number {
  return isPremium ? points : Math.min(points, freePointsCap);
}

export interface TierRow {
  minPoints: number;
  ceiling: number;
}

/** Plafond du palier le plus haut atteint par les points retenus (0 si aucun). */
export function tierCeilingFor(effective: number, tiers: TierRow[]): number {
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

export interface OpenRequestRow {
  amount: number;
  repaid: number;
}

/** Plafond disponible = plafond − capital encore dû sur les demandes engagées. Négatif = dépassement. */
export function availableCeiling(ceiling: number, openRequests: OpenRequestRow[]): number {
  return ceiling - openRequests.reduce((sum, r) => sum + (r.amount - r.repaid), 0);
}

// ---------------------------------------------------------------------------
// Montants : tolérance binaire uniquement (0,1 + 0,2 ≠ 0,3 en virgule flottante).
// ---------------------------------------------------------------------------

export const AMOUNT_EPSILON = 0.000001;

/** Vrai si un montant restant est nul (à la précision de calcul près). */
export function isSettled(amountLeft: number): boolean {
  return Math.abs(amountLeft) < AMOUNT_EPSILON;
}

/** Arrondi au franc le plus proche : le montant dû est toujours un entier de FCFA. */
export function roundToFranc(amount: number): number {
  return Math.round(amount);
}

export interface RepaymentPlan {
  remainingBefore: number;
  remainingAfter: number;
  isPartial: boolean;
  fullyRepaid: boolean;
}

/** Vérifie qu'un remboursement est possible et calcule ce qui reste dû. */
export function planRepayment(amountDue: number, alreadyRepaid: number, amount: number): RepaymentPlan {
  const remainingBefore = amountDue - alreadyRepaid;
  if (amount <= 0) {
    throw new AppError("AMOUNT_NOT_POSITIVE", "Le montant du remboursement doit être positif");
  }
  if (amount > remainingBefore + AMOUNT_EPSILON) {
    throw new AppError("REPAYMENT_EXCEEDS_DUE", `Le remboursement (${amount}) dépasse le montant restant dû (${remainingBefore})`, { amount, remaining: remainingBefore });
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
export const APP_TIMEZONE = "Africa/Libreville";
const APP_UTC_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Numéro du jour calendaire, à Libreville. */
export function localDayIndex(d: Date): number {
  return Math.floor((d.getTime() + APP_UTC_OFFSET_MS) / DAY_MS);
}

/** Nombre de jours calendaires (Libreville) entre deux dates. 0 = même jour. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return localDayIndex(to) - localDayIndex(from);
}

/** Vrai si les deux instants tombent le même jour calendaire à Libreville. */
export function sameLocalDay(a: Date | null | undefined, b: Date): boolean {
  return !!a && localDayIndex(a) === localDayIndex(b);
}

// ---------------------------------------------------------------------------
// Retards : jour de grâce, puis majoration et pénalité de points, jour par jour
// ---------------------------------------------------------------------------

export type LatePhase = "ON_TIME" | "GRACE" | "LATE";

export interface LateState {
  /** ON_TIME : pas encore échu ; GRACE : échu, dans le jour de grâce ; LATE : pénalités applicables. */
  phase: LatePhase;
  /** Jours de grâce restants, aujourd'hui compris (0 hors GRACE). */
  graceDaysLeft: number;
  /** Jours de retard facturés (au-delà de l'échéance + jours de grâce). 0 hors LATE. */
  lateDays: number;
  /** Jours calendaires écoulés depuis l'échéance (0 le jour même, négatif avant). */
  daysAfterDue: number;
}

/**
 * État d'une demande à une date donnée. Le jour de l'échéance n'est jamais en retard.
 * Les `graceDays` jours qui suivent l'échéance ne donnent lieu à aucune pénalité.
 * Le premier jour après le sursis compte pour 1 jour de retard.
 */
export function lateState(dueDate: Date, now: Date, graceDays: number): LateState {
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
export function dailyInterest(interestAmount: number, gridDurationDays: number): number {
  if (gridDurationDays <= 0) return 0;
  return interestAmount / gridDurationDays;
}

/** Majoration exacte pour `lateDays` jours de retard (avant arrondi du total). */
export function surchargeFor(interestAmount: number, gridDurationDays: number, lateDays: number): number {
  if (gridDurationDays <= 0 || lateDays <= 0) return 0;
  return (interestAmount * lateDays) / gridDurationDays;
}

/** Durée maximale choisissable : le double de la durée de la grille (15 jours -> 30 jours, 30 -> 60). */
export const FLEXIBLE_DUE_MAX_FACTOR = 2;

export function maxChoosableDays(gridDurationDays: number): number {
  return gridDurationDays * FLEXIBLE_DUE_MAX_FACTOR;
}

/** Plage de durées choisissables pour une grille donnée. `allowed` = faux si la plage est vide. */
export function dueDateChoiceRange(gridDurationDays: number, minDays: number) {
  const maxDays = maxChoosableDays(gridDurationDays);
  return { minDays, maxDays, allowed: maxDays >= minDays };
}

/**
 * Montant à rembourser selon la durée choisie (arrondi au franc le plus proche) :
 * - durée égale ou plus courte que la grille : on rembourse le montant de la grille, sans réduction ;
 * - durée plus longue : montant de la grille + intérêt journalier de la grille × jours en plus.
 * Ex. 5 000 FCFA, grille 15 jours (6 650 FCFA) : 25 jours -> 6 650 + 110 × 10 = 7 750 FCFA.
 */
export function flexibleAmountDue(
  amount: number,
  gridAmountDue: number,
  gridDurationDays: number,
  chosenDurationDays: number
): number {
  if (gridDurationDays <= 0 || chosenDurationDays <= gridDurationDays) return gridAmountDue;
  const interest = gridAmountDue - amount;
  return roundToFranc(gridAmountDue + (interest / gridDurationDays) * (chosenDurationDays - gridDurationDays));
}

/** Affichage uniquement : montant entier avec séparateurs de milliers. */
export function formatAmount(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(roundToFranc(n));
}

/**
 * Contrôle du choix de date.
 * - Sans choix, ou choix égal à la grille : rien à vérifier.
 * - Choisir une date exige le seuil de points de confiance (étape 50 par défaut).
 * - La durée choisie doit être un entier compris entre minDays (3) et le double de la grille.
 */
export function assertDueChoice(params: {
  chosenDurationDays: number;
  gridDurationDays: number;
  points: number;
  minPoints: number;
  minDays: number;
}): void {
  const { chosenDurationDays, gridDurationDays, points, minPoints, minDays } = params;
  if (chosenDurationDays === gridDurationDays) return;
  if (points < minPoints) {
    throw new AppError(
      "DUE_DATE_CHOICE_LOCKED",
      `Le choix de la date de remboursement est réservé aux clients ayant au moins ${minPoints} points de confiance.`,
      { minPoints }
    );
  }
  const range = dueDateChoiceRange(gridDurationDays, minDays);
  if (!range.allowed || !Number.isInteger(chosenDurationDays) || chosenDurationDays < range.minDays || chosenDurationDays > range.maxDays) {
    throw new AppError(
      "DUE_DATE_OUT_OF_RANGE",
      `La durée doit être comprise entre ${range.minDays} et ${range.maxDays} jours.`,
      { minDays: range.minDays, maxDays: range.maxDays }
    );
  }
}

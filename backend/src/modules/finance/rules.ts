import { AppError } from "../../errors";
/**
 * Règles métier pures (sans accès à la base). Testées dans rules.test.ts.
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
  if (amount > remainingBefore) {
    throw new AppError("REPAYMENT_EXCEEDS_DUE", `Le remboursement (${amount}) dépasse le montant restant dû (${remainingBefore})`, { amount, remaining: remainingBefore });
  }
  const remainingAfter = remainingBefore - amount;
  return {
    remainingBefore,
    remainingAfter,
    isPartial: amount < remainingBefore,
    fullyRepaid: remainingAfter === 0,
  };
}

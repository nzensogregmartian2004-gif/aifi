import { prisma } from "../../db/client";

/**
 * Le montant demandé est rattaché au palier immédiatement inférieur (le plus
 * grand minAmount <= montant). Ex : 1300 FCFA -> palier 1000 FCFA.
 * Si le montant est en dessous du plus petit palier configuré, on refuse
 * (pas de durée définie pour ce cas plutôt que d'en deviner une).
 */
export async function computeDurationForAmount(amount: number): Promise<{ tierAmount: number; durationDays: number }> {
  const tier = await prisma.durationTier.findFirst({
    where: { minAmount: { lte: amount } },
    orderBy: { minAmount: "desc" },
  });
  if (!tier) {
    const smallest = await prisma.durationTier.findFirst({ orderBy: { minAmount: "asc" } });
    throw new Error(
      smallest
        ? `Montant minimum pour une demande : ${smallest.minAmount} FCFA`
        : "Aucune grille de remboursement n'est configurée."
    );
  }
  return { tierAmount: tier.minAmount, durationDays: tier.durationDays };
}

export async function getAllDurationTiers() {
  return prisma.durationTier.findMany({ orderBy: { minAmount: "asc" } });
}

export async function upsertDurationTier(minAmount: number, durationDays: number) {
  return prisma.durationTier.upsert({
    where: { minAmount },
    update: { durationDays },
    create: { minAmount, durationDays },
  });
}

export async function deleteDurationTier(id: string) {
  return prisma.durationTier.delete({ where: { id } });
}

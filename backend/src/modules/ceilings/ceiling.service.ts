import { prisma } from "../../db/client";

export async function computeCeiling(points: number, isPremium = false): Promise<number> {
  const tier = await prisma.ceilingTier.findFirst({
    where: { minPoints: { lte: points } },
    orderBy: { minPoints: "desc" },
  });
  const baseCeiling = tier?.ceiling ?? 0;
  if (!isPremium || baseCeiling === 0) return baseCeiling;

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  return Math.min(baseCeiling * settings.premiumCeilingMultiplier, settings.premiumMaxCeiling);
}

export async function getAllTiers() {
  return prisma.ceilingTier.findMany({ orderBy: { minPoints: "asc" } });
}

export async function upsertTier(minPoints: number, ceiling: number) {
  return prisma.ceilingTier.upsert({
    where: { minPoints },
    update: { ceiling },
    create: { minPoints, ceiling },
  });
}

export async function deleteTier(id: string) {
  return prisma.ceilingTier.delete({ where: { id } });
}
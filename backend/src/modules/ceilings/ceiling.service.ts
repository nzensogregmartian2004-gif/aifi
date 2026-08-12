import { prisma } from "../../db/client";

export async function computeCeiling(points: number): Promise<number> {
  const tier = await prisma.ceilingTier.findFirst({
    where: { minPoints: { lte: points } },
    orderBy: { minPoints: "desc" },
  });
  return tier?.ceiling ?? 0;
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
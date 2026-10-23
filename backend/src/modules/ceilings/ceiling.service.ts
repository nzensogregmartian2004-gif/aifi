import { prisma } from "../../db/client";
import { effectivePoints, tierCeilingFor } from "../finance/rules";

export { effectivePoints };

export async function computeCeiling(points: number, isPremium = false): Promise<number> {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const tiers = await prisma.ceilingTier.findMany({ select: { minPoints: true, ceiling: true } });
  return tierCeilingFor(effectivePoints(points, isPremium, settings.freePointsCap), tiers);
}

/**
 * Recalcule le plafond mis en cache de tous les clients. À appeler après tout
 * changement de palier ou de règle, sinon les clients existants gardent l'ancien plafond.
 */
export async function recomputeAllCeilings(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true, points: true, isPremium: true, ceiling: true } });
  let changed = 0;
  for (const u of users) {
    const ceiling = await computeCeiling(u.points, u.isPremium);
    if (ceiling !== u.ceiling) {
      await prisma.user.update({ where: { id: u.id }, data: { ceiling } });
      changed++;
    }
  }
  return changed;
}

export async function getAllTiers() {
  return prisma.ceilingTier.findMany({ orderBy: { minPoints: "asc" } });
}

export async function upsertTier(minPoints: number, ceiling: number) {
  const tier = await prisma.ceilingTier.upsert({
    where: { minPoints },
    update: { ceiling },
    create: { minPoints, ceiling },
  });
  await recomputeAllCeilings();
  return tier;
}

export async function deleteTier(id: string) {
  const tier = await prisma.ceilingTier.delete({ where: { id } });
  await recomputeAllCeilings();
  return tier;
}

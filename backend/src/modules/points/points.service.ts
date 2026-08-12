import { prisma } from "../../db/client";
import { computeCeiling } from "../ceilings/ceiling.service";

export async function addPoints(userId: string, delta: number, reason: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { points: { increment: delta } },
  });

  const clampedPoints = Math.max(0, user.points);
  if (clampedPoints !== user.points) {
    await prisma.user.update({ where: { id: userId }, data: { points: clampedPoints } });
  }

  const newCeiling = await computeCeiling(clampedPoints);
  if (newCeiling !== user.ceiling) {
    await prisma.user.update({ where: { id: userId }, data: { ceiling: newCeiling } });
  }

  return { points: clampedPoints, ceiling: newCeiling, reason };
}
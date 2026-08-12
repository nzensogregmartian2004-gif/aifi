import { prisma } from "../../db/client";

export async function getAllDurations() {
  return prisma.allowedDuration.findMany({ orderBy: { days: "asc" } });
}

export async function addDuration(days: number) {
  return prisma.allowedDuration.create({ data: { days } });
}

export async function removeDuration(id: string) {
  return prisma.allowedDuration.delete({ where: { id } });
}
import { prisma } from "../../db/client";

export async function creditWallet(userId: string, amount: number, reason: string) {
  return prisma.walletEntry.create({
    data: { userId, amount, reason },
  });
}

export async function getWalletBalance(userId: string): Promise<number> {
  const entries = await prisma.walletEntry.findMany({ where: { userId } });
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
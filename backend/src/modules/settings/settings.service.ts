import { prisma } from "../../db/client";

export async function getSettings() {
  return prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
}

interface SettingsUpdate {
  referralBonus?: number;
  referralPoints?: number;
  commissionPercent?: number;
  minWithdrawal?: number;
  minRepaymentAmount?: number;
  latePenaltyPoints?: number;
  serviceFeePercent?: number;
  premiumServiceFeePercent?: number;
  premiumGraceDays?: number;
  premiumCeilingMultiplier?: number;
  premiumMaxCeiling?: number;
  premiumMonthlyPrice?: number;
}

export async function updateSettings(data: SettingsUpdate) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value < 0) {
      throw new Error(`${key} ne peut pas être négatif`);
    }
  }
  if (data.commissionPercent !== undefined && data.commissionPercent > 100) {
    throw new Error("commissionPercent ne peut pas dépasser 100");
  }

  return prisma.appSettings.update({
    where: { id: "singleton" },
    data,
  });
}
import { AppError } from "../../errors";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { recomputeAllCeilings } from "../ceilings/ceiling.service";

export async function getSettings() {
  return prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
}

interface SettingsUpdate {
  referralBonus?: number;
  referralPoints?: number;
  commissionPercent?: number;
  minWithdrawal?: number;
  minRepaymentAmount?: number;
  serviceFeePercent?: number;
  premiumServiceFeePercent?: number;
  premiumGraceDays?: number;
  standardGraceDays?: number;
  flexibleDueMinPoints?: number;
  flexibleDueMinDays?: number;
  latePenaltyPoints?: number;
  premiumPrice?: number;
  premiumDurationDays?: number;
  freePointsCap?: number;
  // Numéro sur lequel le business reçoit les remboursements déclarés
  // manuellement par les clients (affiché côté client avant déclaration).
  repaymentReceivingOperator?: "AIRTEL_MONEY" | "MOOV_MONEY";
  repaymentReceivingPhone?: string;
  repaymentReceivingName?: string;
  // Section communauté du tableau de bord client
  communityMessage?: string;
  communityShareText?: string;
  communityLinks?: { label: string; url: string }[];
}

export async function updateSettings(data: SettingsUpdate) {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" && value < 0) {
      throw new AppError("INVALID_SETTING", `${key} ne peut pas être négatif`, { key });
    }
  }
  if (data.commissionPercent !== undefined && data.commissionPercent > 100) {
    throw new AppError("INVALID_SETTING", "commissionPercent ne peut pas dépasser 100");
  }
  if (
    data.repaymentReceivingOperator !== undefined &&
    !["AIRTEL_MONEY", "MOOV_MONEY"].includes(data.repaymentReceivingOperator)
  ) {
    throw new AppError("INVALID_SETTING", "repaymentReceivingOperator doit être AIRTEL_MONEY ou MOOV_MONEY");
  }

  const { communityLinks, ...rest } = data;
  const updated = await prisma.appSettings.update({
    where: { id: "singleton" },
    data: {
      ...rest,
      ...(communityLinks !== undefined
        ? { communityLinks: communityLinks as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });

  // Le plafond est mis en cache sur chaque client : si le plafonnement des
  // non-abonnés change, on recalcule tout le monde immédiatement.
  if ("freePointsCap" in data) {
    await recomputeAllCeilings();
  }

  return updated;
}

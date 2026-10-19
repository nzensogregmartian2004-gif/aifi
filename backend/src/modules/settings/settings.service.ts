import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { recomputeCeilingForUser } from "../points/points.service";

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
      throw new Error(`${key} ne peut pas être négatif`);
    }
  }
  if (data.commissionPercent !== undefined && data.commissionPercent > 100) {
    throw new Error("commissionPercent ne peut pas dépasser 100");
  }
  if (
    data.repaymentReceivingOperator !== undefined &&
    !["AIRTEL_MONEY", "MOOV_MONEY"].includes(data.repaymentReceivingOperator)
  ) {
    throw new Error("repaymentReceivingOperator doit être AIRTEL_MONEY ou MOOV_MONEY");
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

  // Le plafond de chaque client est mis en cache (colonne User.ceiling) pour
  // éviter de le recalculer à chaque écran. Il faut donc le recalculer
  // explicitement pour tout le monde dès qu'un réglage qui influence son
  // calcul change (multiplicateur ou plafond dur AIFI+), sinon les clients
  // déjà enregistrés ne voient jamais la correction avant leur prochain
  // changement de points ou de statut premium.
  const ceilingRelatedKeys: (keyof SettingsUpdate)[] = ["premiumCeilingMultiplier", "premiumMaxCeiling"];
  if (ceilingRelatedKeys.some((k) => k in data)) {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const u of users) {
      await recomputeCeilingForUser(u.id);
    }
  }

  return updated;
}

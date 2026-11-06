import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors";
import { logAction } from "../audit/audit.service";
import { addPoints } from "../points/points.service";
import { creditWallet } from "../wallet/wallet.service";
import { notifyUser } from "../notifications/notification.service";

/** Validation atomique : activation, points, bonus, portefeuille et audit sont validés ensemble. */
export async function validateAccount(userId: string, adminId: string, db: any = prisma) {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const locked = await tx.user.updateMany({
      where: { id: userId, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    if (locked.count !== 1) {
      throw new AppError("ALREADY_VALIDATED", "Ce compte n'est pas en attente de validation (déjà validé ou suspendu).");
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await logAction({
      adminId, action: "user_validate", entityType: "User", entityId: user.id,
      before: { status: "PENDING" }, after: { status: "ACTIVE" },
    }, tx);
    await addPoints(user.id, 10, "validation_compte", tx);

    let referral: { id: string; name: string; bonus: number; points: number } | null = null;
    if (user.referredById) {
      const settings = await tx.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      await creditWallet(user.referredById, settings.referralBonus, "referral_bonus", tx);
      await addPoints(user.referredById, settings.referralPoints, "parrainage_valide", tx);
      const sponsor = await tx.user.findUniqueOrThrow({ where: { id: user.referredById }, select: { id: true, name: true } });
      referral = { ...sponsor, bonus: settings.referralBonus, points: settings.referralPoints };
    }
    return { user, referral };
  });

  // Les notifications sont hors transaction : leur indisponibilité ne doit pas annuler les écritures financières.
  await notifyUser(result.user.id, "account_validated", {}).catch(() => {});
  if (result.referral) {
    await notifyUser(result.referral.id, "referral_validated", {
      name: result.referral.name, bonus: result.referral.bonus, points: result.referral.points,
    }).catch(() => {});
  }
  return result.user;
}

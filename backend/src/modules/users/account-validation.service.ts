import { prisma } from "../../db/client";
import { logAction } from "../audit/audit.service";
import { addPoints } from "../points/points.service";
import { creditWallet } from "../wallet/wallet.service";
import { notifyUser } from "../notifications/notification.service";

/**
 * Valide un compte en attente : statut ACTIVE, points de validation,
 * bonus de parrainage si le compte a été parrainé, notification au client.
 * Utilisé par la validation manuelle et par la validation d'un dossier d'identité.
 */
export async function validateAccount(userId: string, adminId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });

  await logAction({
    adminId,
    action: "user_validate",
    entityType: "User",
    entityId: user.id,
    before: { status: "PENDING" },
    after: { status: "ACTIVE" },
  });

  await addPoints(user.id, 10, "validation_compte");

  if (user.referredById) {
    const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    await creditWallet(user.referredById, settings.referralBonus, "referral_bonus");
    await addPoints(user.referredById, settings.referralPoints, "parrainage_valide");
    await notifyUser(
      user.referredById,
      "referral_validated",
      { name: user.name, bonus: settings.referralBonus, points: settings.referralPoints }
    );
  }

  await notifyUser(user.id, "account_validated", {});

  return user;
}

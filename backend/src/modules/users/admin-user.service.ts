import { prisma } from "../../db/client";
import { notifyUser } from "../notifications/notification.service";
import { logAction } from "../audit/audit.service";
import crypto from "crypto";

interface UserUpdate {
  name?: string;
  phone?: string;
  points?: number;
  ceiling?: number;
}

export async function suspendUser(id: string, adminId: string) {
  const user = await prisma.user.update({ where: { id }, data: { status: "SUSPENDED" } });
  await logAction({ adminId, action: "user_suspend", entityType: "User", entityId: id });
  await notifyUser(user.id, "account_suspended", "Votre compte a été suspendu par l'administrateur.");
  return user;
}

export async function reactivateUser(id: string, adminId: string) {
  const user = await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
  await logAction({ adminId, action: "user_reactivate", entityType: "User", entityId: id });
  await notifyUser(user.id, "account_reactivated", "Votre compte a été réactivé.");
  return user;
}

export async function updateUserInfo(id: string, data: UserUpdate, adminId: string) {
  const before = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: { name: true, phone: true, points: true, ceiling: true },
  });
  const user = await prisma.user.update({ where: { id }, data });
  await logAction({
    adminId,
    action: "user_update_info",
    entityType: "User",
    entityId: id,
    before,
    after: { name: user.name, phone: user.phone, points: user.points, ceiling: user.ceiling },
  });
  return user;
}

/**
 * "Suppression" d'un compte = anonymisation, pas de suppression réelle en base.
 * L'historique financier (demandes d'aide, remboursements, retraits, parrainages)
 * est conservé pour l'intégrité comptable, mais les données personnelles
 * (nom, téléphone) sont effacées et remplacées. Le compte devient inutilisable
 * (mot de passe aléatoire, téléphone remplacé) et ne peut plus se connecter.
 * Action irréversible.
 */
export async function anonymizeUser(id: string, adminId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });

  if (user.anonymizedAt) {
    throw new Error("Ce compte est déjà anonymisé");
  }

  const suffix = crypto.randomBytes(6).toString("hex");
  const randomPasswordHash = crypto.randomBytes(32).toString("hex"); // non utilisable, ne matchera jamais un mot de passe réel

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: "Utilisateur supprimé",
      phone: `supprime_${suffix}`,
      referralCode: `DEL_${suffix.toUpperCase()}`,
      passwordHash: randomPasswordHash,
      status: "SUSPENDED",
      anonymizedAt: new Date(),
    },
  });

  await logAction({
    adminId,
    action: "user_anonymize",
    entityType: "User",
    entityId: id,
    before: { name: user.name, phone: user.phone },
    note: "Anonymisation irréversible",
  });

  return updated;
}
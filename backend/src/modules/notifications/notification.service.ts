import { prisma } from "../../db/client";

/**
 * Envoie une notification push via l'API Expo (gratuite, pas de compte tiers requis
 * au-delà d'un compte Expo pour le projet mobile). Échoue silencieusement si
 * l'utilisateur n'a pas de token, si le token n'est pas un token Expo valide,
 * ou si Expo est injoignable — la notification en-app reste toujours créée.
 */
async function sendExpoPush(pushToken: string | null | undefined, title: string, body: string) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return;

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        sound: "default",
      }),
    });
  } catch (err) {
    // On ne bloque jamais une action métier à cause d'un échec d'envoi push
    console.error("Échec envoi push Expo:", err);
  }
}

/**
 * Envoie une notification (en-app + push) à un utilisateur précis.
 */
export async function notifyUser(
  userId: string,
  type: string,
  message: string,
  aidRequestId?: string
) {
  const notification = await prisma.notification.create({
    data: { userId, type, message, aidRequestId },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
  await sendExpoPush(user?.pushToken, "AIFI", message);

  return notification;
}

/**
 * Envoie une notification (en-app + push) à tous les administrateurs actifs.
 * Utilisé pour : nouvelle demande d'aide, déclaration de remboursement,
 * demande de retrait — tout ce qui nécessite un traitement manuel.
 */
export async function notifyAdmins(type: string, message: string, aidRequestId?: string) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true, pushToken: true },
  });

  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type, message, aidRequestId })),
  });

  await Promise.all(admins.map((a) => sendExpoPush(a.pushToken, "AIFI — action requise", message)));
}

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { sentAt: "desc" },
    take: 50,
  });
}

export async function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function savePushToken(userId: string, pushToken: string) {
  await prisma.user.update({ where: { id: userId }, data: { pushToken } });
  return { success: true };
}

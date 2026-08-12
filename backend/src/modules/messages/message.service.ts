import { prisma } from "../../db/client";
import { notifyAdmins, notifyUser } from "../notifications/notification.service";

/**
 * Un seul fil de discussion par client, partagé par toute l'équipe admin
 * (pas de conversation privée par admin — tout le monde voit tout, ce qui
 * évite qu'un client doive répéter la même chose à plusieurs administrateurs).
 */

export async function sendClientMessage(clientId: string, text?: string, imageUrl?: string) {
  if (!text && !imageUrl) {
    throw new Error("Le message doit contenir du texte ou une image");
  }
  const message = await prisma.message.create({
    data: { clientId, senderId: clientId, senderRole: "CLIENT", text, imageUrl },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: clientId } });
  await notifyAdmins("client_message", `${user.name} a envoyé un message.`);

  return message;
}

export async function sendAdminMessage(clientId: string, adminId: string, text?: string, imageUrl?: string) {
  if (!text && !imageUrl) {
    throw new Error("Le message doit contenir du texte ou une image");
  }
  const message = await prisma.message.create({
    data: { clientId, senderId: adminId, senderRole: "ADMIN", text, imageUrl },
  });

  await notifyUser(clientId, "admin_message", "Vous avez reçu un message de l'administrateur.");

  return message;
}

export async function getThread(clientId: string) {
  return prisma.message.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });
}

export async function markThreadRead(clientId: string, readerRole: "CLIENT" | "ADMIN") {
  // Le client marque comme lus les messages envoyés par l'admin, et vice versa.
  const otherRole = readerRole === "CLIENT" ? "ADMIN" : "CLIENT";
  await prisma.message.updateMany({
    where: { clientId, senderRole: otherRole, read: false },
    data: { read: true },
  });
}

export async function listConversationsForAdmin() {
  // Un client par conversation, avec dernier message + nombre de non-lus (messages client non lus par l'admin).
  const clientsWithMessages = await prisma.user.findMany({
    where: { clientMessages: { some: {} } },
    select: {
      id: true,
      name: true,
      phone: true,
      clientMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          clientMessages: {
            where: { senderRole: "CLIENT", read: false },
          },
        },
      },
    },
  });

  return clientsWithMessages
    .map((c) => ({
      clientId: c.id,
      name: c.name,
      phone: c.phone,
      lastMessage: c.clientMessages[0] || null,
      unreadCount: c._count.clientMessages,
    }))
    .sort((a, b) => {
      const dateA = a.lastMessage?.createdAt?.getTime() ?? 0;
      const dateB = b.lastMessage?.createdAt?.getTime() ?? 0;
      return dateB - dateA;
    });
}

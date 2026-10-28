"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendClientMessage = sendClientMessage;
exports.sendAdminMessage = sendAdminMessage;
exports.getThread = getThread;
exports.markThreadRead = markThreadRead;
exports.listConversationsForAdmin = listConversationsForAdmin;
const errors_1 = require("../../errors");
const upload_ownership_1 = require("../uploads/upload-ownership");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notifications/notification.service");
/**
 * Un seul fil de discussion par client, partagé par toute l'équipe admin
 * (pas de conversation privée par admin — tout le monde voit tout, ce qui
 * évite qu'un client doive répéter la même chose à plusieurs administrateurs).
 */
async function sendClientMessage(clientId, text, imageUrl) {
    if (!text && !imageUrl) {
        throw new errors_1.AppError("MESSAGE_EMPTY", "Le message doit contenir du texte ou une image");
    }
    await (0, upload_ownership_1.assertOwnUpload)(imageUrl, clientId);
    const message = await client_1.prisma.message.create({
        data: { clientId, senderId: clientId, senderRole: "CLIENT", text, imageUrl },
    });
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: clientId } });
    await (0, notification_service_1.notifyAdmins)("admin_client_message", { name: user.name });
    return message;
}
async function sendAdminMessage(clientId, adminId, text, imageUrl) {
    if (!text && !imageUrl) {
        throw new errors_1.AppError("MESSAGE_EMPTY", "Le message doit contenir du texte ou une image");
    }
    const message = await client_1.prisma.message.create({
        data: { clientId, senderId: adminId, senderRole: "ADMIN", text, imageUrl },
    });
    await (0, notification_service_1.notifyUser)(clientId, "admin_message", {});
    return message;
}
async function getThread(clientId) {
    return client_1.prisma.message.findMany({
        where: { clientId },
        orderBy: { createdAt: "asc" },
    });
}
async function markThreadRead(clientId, readerRole) {
    // Le client marque comme lus les messages envoyés par l'admin, et vice versa.
    const otherRole = readerRole === "CLIENT" ? "ADMIN" : "CLIENT";
    await client_1.prisma.message.updateMany({
        where: { clientId, senderRole: otherRole, read: false },
        data: { read: true },
    });
}
async function listConversationsForAdmin() {
    // Un client par conversation, avec dernier message + nombre de non-lus (messages client non lus par l'admin).
    const clientsWithMessages = await client_1.prisma.user.findMany({
        where: { clientMessages: { some: {} } },
        select: {
            id: true,
            name: true,
            phone: true,
            isPremium: true,
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
        isPremium: c.isPremium,
        lastMessage: c.clientMessages[0] || null,
        unreadCount: c._count.clientMessages,
    }))
        .sort((a, b) => {
        // Support prioritaire AIFI+ : leurs conversations remontent toujours
        // en tête, avant le tri habituel par message le plus récent.
        if (a.isPremium !== b.isPremium)
            return a.isPremium ? -1 : 1;
        const dateA = a.lastMessage?.createdAt?.getTime() ?? 0;
        const dateB = b.lastMessage?.createdAt?.getTime() ?? 0;
        return dateB - dateA;
    });
}

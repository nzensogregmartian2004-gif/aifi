"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyUser = notifyUser;
exports.notifyAdmins = notifyAdmins;
exports.listNotifications = listNotifications;
exports.countUnread = countUnread;
exports.markRead = markRead;
exports.markAllRead = markAllRead;
exports.savePushToken = savePushToken;
const templates_1 = require("../../notifications/templates");
const client_1 = require("../../db/client");
/**
 * Envoie une notification push via l'API Expo (gratuite, pas de compte tiers requis
 * au-delà d'un compte Expo pour le projet mobile). Échoue silencieusement si
 * l'utilisateur n'a pas de token, si le token n'est pas un token Expo valide,
 * ou si Expo est injoignable — la notification en-app reste toujours créée.
 */
async function sendExpoPush(pushToken, title, body) {
    if (!pushToken || !pushToken.startsWith("ExponentPushToken"))
        return;
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
    }
    catch (err) {
        // On ne bloque jamais une action métier à cause d'un échec d'envoi push
        console.error("Échec envoi push Expo:", err);
    }
}
/**
 * Envoie une notification (en-app + push) à un utilisateur précis.
 */
async function notifyUser(userId, type, params = {}, aidRequestId) {
    // Le texte est écrit dans la langue du destinataire (en-app comme push)
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true, language: true },
    });
    const message = (0, templates_1.renderNotification)(type, params, (0, templates_1.normalizeLang)(user?.language));
    const notification = await client_1.prisma.notification.create({
        data: { userId, type, message, params: params, aidRequestId },
    });
    await sendExpoPush(user?.pushToken, "AIFI", message);
    return notification;
}
/**
 * Envoie une notification (en-app + push) à tous les administrateurs actifs, chacun
 * dans sa propre langue. Utilisé pour : nouvelle demande d'aide, déclaration de
 * remboursement, demande de retrait — tout ce qui nécessite un traitement manuel.
 */
async function notifyAdmins(type, params = {}, aidRequestId) {
    const admins = await client_1.prisma.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { id: true, pushToken: true, language: true },
    });
    if (admins.length === 0)
        return;
    const messages = admins.map((a) => (0, templates_1.renderNotification)(type, params, (0, templates_1.normalizeLang)(a.language)));
    await client_1.prisma.notification.createMany({
        data: admins.map((a, i) => ({
            userId: a.id,
            type,
            message: messages[i],
            params: params,
            aidRequestId,
        })),
    });
    await Promise.all(admins.map((a, i) => sendExpoPush(a.pushToken, "AIFI — action requise", messages[i])));
}
async function listNotifications(userId) {
    return client_1.prisma.notification.findMany({
        where: { userId },
        orderBy: { sentAt: "desc" },
        take: 50,
    });
}
async function countUnread(userId) {
    return client_1.prisma.notification.count({ where: { userId, read: false } });
}
async function markRead(userId, id) {
    return client_1.prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true },
    });
}
async function markAllRead(userId) {
    return client_1.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
    });
}
async function savePushToken(userId, pushToken) {
    await client_1.prisma.user.update({ where: { id: userId }, data: { pushToken } });
    return { success: true };
}

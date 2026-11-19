"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyUser = notifyUser;
exports.notifyAdmins = notifyAdmins;
exports.listNotifications = listNotifications;
exports.countUnread = countUnread;
exports.markRead = markRead;
exports.markAllRead = markAllRead;
exports.savePushToken = savePushToken;
exports.getNotificationSettings = getNotificationSettings;
exports.setPushEnabled = setPushEnabled;
const templates_1 = require("../../notifications/templates");
const client_1 = require("../../db/client");
/**
 * Envoie une notification push via l'API Expo (gratuite, pas de compte tiers requis
 * au-delà d'un compte Expo pour le projet mobile). Échoue silencieusement si
 * l'utilisateur n'a pas de token, si le token n'est pas un token Expo valide,
 * ou si Expo est injoignable — la notification en-app reste toujours créée.
 */
/**
 * Envoie une notification push via l'API Expo.
 *
 * Expo répond HTTP 200 même quand l'envoi est refusé : il faut lire le ticket. Les causes
 * fréquentes (identifiants FCM/APNs absents, token périmé) étaient avalées en silence.
 * Un token qui n'existe plus sur l'appareil (DeviceNotRegistered) est effacé.
 * La notification en-app reste toujours créée, quoi qu'il arrive.
 */
async function sendExpoPush(userId, pushToken, title, body) {
    if (!pushToken || !pushToken.startsWith("ExponentPushToken"))
        return;
    try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                to: pushToken,
                title,
                body,
                sound: "default",
                channelId: "default", // canal Android créé côté app (push.js)
                priority: "high", // livraison prioritaire, même app fermée
            }),
        });
        const json = await res.json().catch(() => null);
        const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
        if (!res.ok || ticket?.status !== "ok") {
            const code = ticket?.details?.error ?? `HTTP ${res.status}`;
            console.error(`[push] envoi refusé (${code}) pour l'utilisateur ${userId ?? "?"} : ${ticket?.message ?? ""}`);
            if (code === "DeviceNotRegistered" && userId) {
                await client_1.prisma.user.update({ where: { id: userId }, data: { pushToken: null } }).catch(() => { });
            }
        }
    }
    catch (err) {
        console.error("[push] Expo injoignable :", err);
    }
}
/**
 * Envoie une notification (en-app + push) à un utilisateur précis.
 */
async function notifyUser(userId, type, params = {}, aidRequestId) {
    // Le texte est écrit dans la langue du destinataire (en-app comme push)
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true, language: true, pushEnabled: true },
    });
    const message = (0, templates_1.renderNotification)(type, params, (0, templates_1.normalizeLang)(user?.language));
    const notification = await client_1.prisma.notification.create({
        data: { userId, type, message, params: params, aidRequestId },
    });
    await sendExpoPush(userId, user?.pushEnabled ? user.pushToken : null, "AIFI", message);
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
        select: { id: true, pushToken: true, language: true, pushEnabled: true },
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
    await Promise.all(admins.map((a, i) => sendExpoPush(a.id, a.pushEnabled ? a.pushToken : null, "AIFI — action requise", messages[i])));
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
/** Réglages de notifications de l'utilisateur (même route pour les clients et les admins). */
async function getNotificationSettings(userId) {
    const user = await client_1.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pushEnabled: true, pushToken: true },
    });
    return { pushEnabled: user.pushEnabled, hasPushToken: !!user.pushToken, deviceRegistered: !!user.pushToken };
}
async function setPushEnabled(userId, pushEnabled) {
    await client_1.prisma.user.update({ where: { id: userId }, data: { pushEnabled } });
    return { pushEnabled };
}

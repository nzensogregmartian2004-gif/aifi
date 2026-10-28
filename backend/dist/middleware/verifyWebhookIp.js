"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowlistedMypvitIp = isAllowlistedMypvitIp;
exports.requireMypvitWebhookAllowlist = requireMypvitWebhookAllowlist;
exports.verifyMypvitWebhookIp = verifyMypvitWebhookIp;
function allowedIps() {
    return (process.env.MYPVIT_WEBHOOK_ALLOWED_IPS ?? "")
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean);
}
/**
 * Vrai si l'appelant fait partie des IP MyPVit explicitement autorisées.
 * Sans liste configurée, renvoie toujours faux : un callback non vérifiable
 * ne peut alors jamais créditer un paiement à lui seul.
 */
function isAllowlistedMypvitIp(req) {
    const list = allowedIps();
    if (list.length === 0)
        return false;
    const callerIp = (req.ip ?? "").replace(/^::ffff:/, ""); // adresses IPv4-mapped-IPv6
    return list.includes(callerIp);
}
/**
 * Pour les endpoints qui ÉCRIVENT une clé secrète MyPVit (réception de clé) :
 * sans liste d'IP configurée, on refuse. Sinon n'importe qui pourrait injecter
 * une fausse clé et bloquer tous les paiements.
 */
function requireMypvitWebhookAllowlist(req, res, next) {
    if (allowedIps().length === 0) {
        console.error("[requireMypvitWebhookAllowlist] appel refusé : MYPVIT_WEBHOOK_ALLOWED_IPS est vide");
        return res.status(403).json({ error: "Réception de clé désactivée : liste IP non configurée" });
    }
    if (!isAllowlistedMypvitIp(req)) {
        console.error(`[requireMypvitWebhookAllowlist] appel refusé : IP non autorisée (${req.ip})`);
        return res.status(403).json({ error: "IP non autorisée" });
    }
    next();
}
/**
 * Filtre les appels webhook MyPVit par adresse IP source. Tant que la liste
 * n'est pas configurée, l'appel est accepté mais ne peut pas créditer seul
 * (voir handleMypvitCallback) : ça doit être rempli avant la mise en production.
 */
function verifyMypvitWebhookIp(req, res, next) {
    if (allowedIps().length === 0) {
        console.warn("[verifyMypvitWebhookIp] MYPVIT_WEBHOOK_ALLOWED_IPS n'est pas configuré : les callbacks ne seront crédités qu'après vérification auprès de MyPVit.");
        return next();
    }
    if (!isAllowlistedMypvitIp(req)) {
        console.error(`[verifyMypvitWebhookIp] Webhook MyPVit refusé : IP non autorisée (${req.ip})`);
        return res.status(403).json({ error: "IP non autorisée" });
    }
    next();
}

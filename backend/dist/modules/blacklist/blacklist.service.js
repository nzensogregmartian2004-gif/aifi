"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalPhone = canonicalPhone;
exports.phoneVariants = phoneVariants;
exports.nameKey = nameKey;
exports.similarity = similarity;
exports.isPhoneBlacklisted = isPhoneBlacklisted;
exports.hashesForUrls = hashesForUrls;
exports.checkVerification = checkVerification;
exports.blacklistUser = blacklistUser;
exports.addManualEntry = addManualEntry;
exports.removeEntry = removeEntry;
exports.listEntries = listEntries;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
function canonicalPhone(raw) {
    let p = raw.replace(/[^\d+]/g, "");
    if (p.startsWith("00"))
        p = "+" + p.slice(2);
    if (p.startsWith("+241"))
        p = "0" + p.slice(4);
    else if (/^241\d{8}$/.test(p))
        p = "0" + p.slice(3);
    return p;
}
function phoneVariants(raw) {
    const c = canonicalPhone(raw);
    const set = new Set([raw.replace(/[^\d+]/g, ""), c]);
    if (c.startsWith("0")) {
        const local = c.slice(1);
        set.add(`+241${local}`);
        set.add(`00241${local}`);
        set.add(`241${local}`);
    }
    return [...set];
}
/** Nom normalisé : sans accents, minuscules, mots triés (ordre prénom/nom indifférent). */
function nameKey(name) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(" ");
}
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++)
        d[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }
    return d[m][n];
}
/** Ressemblance entre 0 et 1 (1 = identique). */
function similarity(a, b) {
    if (!a || !b)
        return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
async function isPhoneBlacklisted(phone) {
    const hit = await client_1.prisma.blacklistEntry.findFirst({
        where: { removedAt: null, phone: { in: phoneVariants(phone) } },
        select: { id: true },
    });
    return !!hit;
}
/** Empreintes SHA-256 des fichiers envoyés (calculées à l'envoi). */
async function hashesForUrls(urls) {
    if (urls.length === 0)
        return [];
    const rows = await client_1.prisma.upload.findMany({ where: { url: { in: urls } }, select: { sha256: true } });
    return rows.map((r) => r.sha256).filter((h) => !!h);
}
/**
 * Contrôles d'un dossier d'identité.
 * - Pièce présente en liste noire : dossier refusé (message neutre).
 * - Pièce déjà utilisée par un autre compte, nom proche d'une entrée, téléphone en liste : signalements pour l'admin.
 */
async function checkVerification(userId, urls) {
    const flags = [];
    const hashes = await hashesForUrls(urls);
    if (hashes.length > 0) {
        const blacklisted = await client_1.prisma.blacklistEntry.findFirst({
            where: { removedAt: null, documentHashes: { hasSome: hashes } },
            select: { id: true },
        });
        if (blacklisted) {
            throw new errors_1.AppError("ACCOUNT_BLOCKED", "Ce dossier ne peut pas être traité. Contacte le support.");
        }
        const sameDocument = await client_1.prisma.upload.findFirst({
            where: { sha256: { in: hashes }, ownerId: { not: userId } },
            select: { id: true },
        });
        if (sameDocument)
            flags.push("PIECE_UTILISEE_PAR_UN_AUTRE_COMPTE");
    }
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true } });
    const key = nameKey(user.name);
    const entries = await client_1.prisma.blacklistEntry.findMany({
        where: { removedAt: null, nameKey: { not: null } },
        select: { nameKey: true },
    });
    if (entries.some((e) => similarity(key, e.nameKey) >= 0.85)) {
        flags.push("NOM_PROCHE_D_UNE_ENTREE_LISTE_NOIRE");
    }
    if (await isPhoneBlacklisted(user.phone)) {
        flags.push("TELEPHONE_EN_LISTE_NOIRE");
    }
    return flags;
}
/** Ajoute un client à la liste noire, avec ses empreintes de pièces (documents conservés). */
async function blacklistUser(userId, reason, source) {
    const existing = await client_1.prisma.blacklistEntry.findFirst({ where: { userId, removedAt: null }, select: { id: true } });
    if (existing)
        return existing;
    const user = await client_1.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true } });
    const verification = await client_1.prisma.identityVerification.findUnique({
        where: { userId },
        select: { frontUrl: true, backUrl: true, extraUrls: true },
    });
    const urls = verification
        ? [verification.frontUrl, verification.backUrl, ...verification.extraUrls].filter((u) => !!u)
        : [];
    const documentHashes = await hashesForUrls(urls);
    return client_1.prisma.blacklistEntry.create({
        data: {
            phone: canonicalPhone(user.phone),
            nameKey: nameKey(user.name),
            documentHashes,
            reason,
            source,
            userId,
        },
    });
}
async function addManualEntry(phone, reason) {
    return client_1.prisma.blacklistEntry.create({
        data: { phone: canonicalPhone(phone), reason, source: "ADMIN" },
    });
}
async function removeEntry(id, reason) {
    return client_1.prisma.blacklistEntry.update({
        where: { id },
        data: { removedAt: new Date(), removedReason: reason },
    });
}
async function listEntries() {
    return client_1.prisma.blacklistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

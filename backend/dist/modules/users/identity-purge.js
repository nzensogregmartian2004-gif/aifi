"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeIdentityFiles = purgeIdentityFiles;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const client_1 = require("../../db/client");
const upload_1 = require("../../middleware/upload");
/**
 * Supprime les pièces d'identité d'un client : recto, verso, documents supplémentaires
 * et images envoyées dans la messagerie (où le message de bienvenue demande les pièces).
 *
 * Conservé volontairement :
 *  - les justificatifs de paiement (remboursements, retraits, déclarations) : pièces comptables ;
 *  - les lignes Upload, car leur empreinte SHA-256 sert à la liste noire et à la détection
 *    des pièces déjà utilisées par un autre compte. Seul le fichier disparaît.
 *
 * Le texte des messages est conservé, seul le lien vers l'image est retiré.
 * Retourne le nombre de fichiers supprimés du disque.
 */
async function purgeIdentityFiles(userId) {
    const [repayments, withdrawals, declarations] = await Promise.all([
        client_1.prisma.repayment.findMany({
            where: { proofImageUrl: { not: null }, aidRequest: { userId } },
            select: { proofImageUrl: true },
        }),
        client_1.prisma.withdrawal.findMany({ where: { userId, proofImageUrl: { not: null } }, select: { proofImageUrl: true } }),
        client_1.prisma.repaymentDeclaration.findMany({ where: { userId, proofImageUrl: { not: null } }, select: { proofImageUrl: true } }),
    ]);
    const keep = new Set([...repayments, ...withdrawals, ...declarations].map((r) => r.proofImageUrl));
    const verification = await client_1.prisma.identityVerification.findUnique({ where: { userId } });
    const messages = await client_1.prisma.message.findMany({
        where: { clientId: userId, imageUrl: { not: null } },
        select: { imageUrl: true },
    });
    const uploads = await client_1.prisma.upload.findMany({ where: { ownerId: userId }, select: { url: true } });
    const candidates = new Set([
        ...(verification ? [verification.frontUrl, verification.backUrl, verification.selfieUrl, ...verification.extraUrls] : [])
            .filter((u) => !!u),
        ...messages.map((m) => m.imageUrl),
        ...uploads.map((u) => u.url),
    ]);
    const toDelete = [...candidates].filter((url) => !keep.has(url));
    let deleted = 0;
    for (const url of toDelete) {
        // Seuls les noms produits par le téléversement sont acceptés : aucune traversée de dossier.
        if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(url))
            continue;
        try {
            await promises_1.default.unlink(path_1.default.join(upload_1.UPLOAD_DIR, path_1.default.basename(url)));
            deleted++;
        }
        catch (err) {
            if (err?.code !== "ENOENT")
                console.error("[purge] suppression impossible :", url, err?.message);
        }
    }
    await client_1.prisma.message.updateMany({
        where: { clientId: userId, imageUrl: { in: toDelete } },
        data: { imageUrl: null },
    });
    // La fiche de vérification pointe vers des fichiers désormais supprimés : on la retire.
    if (verification) {
        await client_1.prisma.identityVerification.delete({ where: { userId } });
    }
    return deleted;
}

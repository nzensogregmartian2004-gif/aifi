"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_PATH_REGEX = void 0;
exports.assertOwnUpload = assertOwnUpload;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
// Seuls les chemins produits par notre téléversement sont acceptés (/uploads/<nom>)
exports.UPLOAD_PATH_REGEX = /^\/uploads\/[A-Za-z0-9._-]+$/;
/**
 * Vérifie qu'un fichier joint par un client lui appartient bien.
 * Sans ce contrôle, un client pouvait joindre l'URL d'un document d'un autre client.
 */
async function assertOwnUpload(url, userId) {
    if (!url)
        return;
    if (!exports.UPLOAD_PATH_REGEX.test(url)) {
        throw new errors_1.AppError("FILE_INVALID", "Fichier joint invalide.");
    }
    const owned = await client_1.prisma.upload.findFirst({ where: { url, ownerId: userId } });
    if (!owned) {
        throw new errors_1.AppError("FILE_NOT_OWNED", "Ce fichier ne peut pas être joint. Envoie une nouvelle photo depuis l'application.");
    }
}

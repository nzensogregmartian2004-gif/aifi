"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyVerification = getMyVerification;
exports.submitVerification = submitVerification;
const errors_1 = require("../../errors");
const blacklist_service_1 = require("../blacklist/blacklist.service");
const client_1 = require("../../db/client");
const upload_ownership_1 = require("../uploads/upload-ownership");
async function getMyVerification(userId) {
    return client_1.prisma.identityVerification.findUnique({ where: { userId } });
}
async function submitVerification(userId, input) {
    const existing = await client_1.prisma.identityVerification.findUnique({ where: { userId } });
    if (existing?.status === "APPROVED") {
        throw new errors_1.AppError("ALREADY_VERIFIED", "Ton identité est déjà vérifiée.");
    }
    // Le verso est obligatoire, sauf pour le passeport (une seule page photo).
    if (input.documentType !== "PASSPORT" && !input.backUrl) {
        throw new errors_1.AppError("BACK_PHOTO_REQUIRED", "Ajoute la photo du verso de ta pièce d'identité.");
    }
    // Chaque fichier doit avoir été envoyé par ce client (sinon on pourrait joindre le fichier d'un autre).
    for (const url of [input.frontUrl, input.backUrl, ...input.extraUrls]) {
        await (0, upload_ownership_1.assertOwnUpload)(url, userId);
    }
    const urls = [input.frontUrl, input.backUrl, ...input.extraUrls].filter((u) => !!u);
    const riskFlags = await (0, blacklist_service_1.checkVerification)(userId, urls);
    const data = {
        documentType: input.documentType,
        frontUrl: input.frontUrl,
        backUrl: input.backUrl ?? null,
        extraUrls: input.extraUrls,
        status: "PENDING",
        reviewNote: null,
        reviewedAt: null,
        riskFlags,
    };
    return client_1.prisma.identityVerification.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data },
    });
}

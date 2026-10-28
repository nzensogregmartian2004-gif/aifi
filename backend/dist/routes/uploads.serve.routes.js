"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
/**
 * Sert les fichiers uploadés (pièces d'identité, selfies, justificatifs de
 * paiement...) — remplace l'ancien `express.static("/uploads")` qui rendait
 * ces documents accessibles à QUICONQUE connaissait ou devinait l'URL, sans
 * aucune authentification. Vu la sensibilité des documents KYC, l'accès est
 * maintenant réservé :
 *   - aux administrateurs (qui doivent pouvoir tout vérifier) ;
 *   - au client propriétaire du document (son propre fil de messagerie,
 *     ses propres justificatifs de remboursement/retrait/décaissement).
 *
 * L'URL reste `/uploads/<nom-de-fichier>` (inchangée) pour ne pas casser les
 * liens déjà stockés en base — seul le comportement change : authentification
 * requise + vérification de propriété.
 */
router.get("/:filename", auth_1.requireAuth, async (req, res) => {
    const filename = path_1.default.basename(req.params.filename); // empêche toute tentative de traversée de répertoire (../..)
    const filePath = path_1.default.join(upload_1.UPLOAD_DIR, filename);
    if (!fs_1.default.existsSync(filePath)) {
        return res.status(404).json({ error: "Fichier introuvable" });
    }
    const auth = req.auth;
    if (auth.role !== "ADMIN") {
        const allowed = await canAccessUpload(auth.userId, `/uploads/${filename}`);
        if (!allowed) {
            return res.status(403).json({ error: "Accès refusé à ce fichier" });
        }
    }
    // Aucun contenu ne peut être interprété par le navigateur, même mal nommé
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.sendFile(filePath);
});
async function canAccessUpload(userId, url) {
    const [owned, message, repayment, declaration, withdrawal] = await Promise.all([
        client_1.prisma.upload.findFirst({ where: { url, ownerId: userId } }),
        client_1.prisma.message.findFirst({ where: { imageUrl: url, clientId: userId } }),
        client_1.prisma.repayment.findFirst({ where: { proofImageUrl: url, aidRequest: { userId } } }),
        client_1.prisma.repaymentDeclaration.findFirst({ where: { proofImageUrl: url, userId } }),
        client_1.prisma.withdrawal.findFirst({ where: { proofImageUrl: url, userId } }),
    ]);
    return !!(owned || message || repayment || declaration || withdrawal);
}
exports.default = router;

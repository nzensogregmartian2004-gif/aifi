import { Router } from "express";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth";
import { UPLOAD_DIR } from "../middleware/upload";
import { prisma } from "../db/client";

const router = Router();

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
router.get("/:filename", requireAuth, async (req, res) => {
  const filename = path.basename(req.params.filename as string); // empêche toute tentative de traversée de répertoire (../..)
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable" });
  }

  const auth = req.auth!;
  if (auth.role !== "ADMIN") {
    const allowed = await canAccessUpload(auth.userId, `/uploads/${filename}`);
    if (!allowed) {
      return res.status(403).json({ error: "Accès refusé à ce fichier" });
    }
  }

  res.sendFile(filePath);
});

async function canAccessUpload(userId: string, url: string): Promise<boolean> {
  const [message, repayment, declaration, withdrawal] = await Promise.all([
    prisma.message.findFirst({ where: { imageUrl: url, clientId: userId } }),
    prisma.repayment.findFirst({ where: { proofImageUrl: url, aidRequest: { userId } } }),
    prisma.repaymentDeclaration.findFirst({ where: { proofImageUrl: url, userId } }),
    prisma.withdrawal.findFirst({ where: { proofImageUrl: url, userId } }),
  ]);
  return !!(message || repayment || declaration || withdrawal);
}

export default router;

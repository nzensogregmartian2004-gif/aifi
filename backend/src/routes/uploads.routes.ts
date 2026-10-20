import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { prisma } from "../db/client";

const router = Router();

router.use(requireAuth);

// Format refusé ou fichier trop lourd : réponse 400 lisible au lieu d'une 500 générique.
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Téléversement impossible" });
    }
    next();
  });
}

// Utilisé pour : justificatifs de transaction et justificatifs/photos envoyés dans la messagerie.
// Le propriétaire du fichier est enregistré : c'est lui seul qui pourra le joindre.
router.post("/", handleUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier reçu" });
  }
  const url = `/uploads/${req.file.filename}`;
  try {
    // Empreinte SHA-256 du fichier : sert à repérer une pièce déjà vue (liste noire, doublons).
    let sha256: string | null = null;
    try {
      const nodeCrypto = require("crypto");
      const nodeFs = require("fs");
      const nodePath = require("path");
      const dir = process.env.UPLOAD_DIR?.trim() || nodePath.join(process.cwd(), "uploads");
      const bytes = nodeFs.readFileSync(nodePath.join(dir, nodePath.basename(url)));
      sha256 = nodeCrypto.createHash("sha256").update(bytes).digest("hex");
    } catch {
      sha256 = null;
    }
    await prisma.upload.create({ data: { url, ownerId: req.auth!.userId, sha256 } });
    res.json({ url });
  } catch (err: any) {
    console.error("[uploads] enregistrement du fichier impossible:", err);
    res.status(500).json({ error: "Impossible d'enregistrer le fichier. Réessaie." });
  }
});

export default router;

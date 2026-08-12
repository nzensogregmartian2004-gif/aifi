import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.use(requireAuth);

// Utilisé pour : justificatifs de transaction (côté admin) et justificatifs/photos
// envoyés dans la messagerie (côté client ou admin). Le fichier est stocké sur le
// serveur, l'appelant récupère une URL relative à réutiliser dans les autres appels
// (proofImageUrl, imageUrl, etc.).
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier reçu" });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

export default router;

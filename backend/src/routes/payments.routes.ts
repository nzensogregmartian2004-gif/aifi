import { Router } from "express";
import { handleMypvitCallback } from "../modules/payments/payment.service";

const router = Router();

// Route publique (pas de requireAuth) : c'est MyPVit qui appelle ce endpoint,
// pas notre app. Voir docs.mypvit.pro — le seul mécanisme de confiance documenté
// est de restreindre l'accès par adresse IP côté infra (ex: règle nginx/firewall
// n'autorisant que les IPs MyPVit). Pense à la configurer avant la mise en prod.
router.post("/mypvit/callback", async (req, res) => {
  try {
    const payload = req.body;
    await handleMypvitCallback(payload);

    // Accusé de réception EXACT attendu par MyPVit : écho dynamique de
    // transactionId et code, jamais une valeur codée en dur.
    res.status(200).json({
      transactionId: payload.transactionId,
      responseCode: payload.code,
    });
  } catch (err: any) {
    // Même en cas d'erreur de notre côté, on évite de laisser MyPVit sans
    // réponse structurée — mais on log pour investigation.
    console.error("[mypvit callback] erreur de traitement:", err);
    res.status(200).json({
      transactionId: req.body?.transactionId,
      responseCode: req.body?.code,
    });
  }
});

export default router;

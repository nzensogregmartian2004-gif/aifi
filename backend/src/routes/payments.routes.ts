import { Router } from "express";
import { handleMypvitCallback } from "../modules/payments/payment.service";
import { receiveSecretFromWebhook } from "../modules/payments/mypvit.client";
import {
  verifyMypvitWebhookIp,
  requireMypvitWebhookAllowlist,
  isAllowlistedMypvitIp,
} from "../middleware/verifyWebhookIp";

const router = Router();

// Route publique (pas de requireAuth) : c'est MyPVit qui appelle ce endpoint.
// Le callback ne crédite jamais seul : il déclenche une vérification auprès de
// MyPVit (voir handleMypvitCallback).
router.post("/mypvit/callback", verifyMypvitWebhookIp, async (req, res) => {
  const payload = req.body;

  if (typeof payload?.merchantReferenceId === "string") {
    try {
      await handleMypvitCallback(payload, { fromAllowlistedIp: isAllowlistedMypvitIp(req) });
    } catch (err: any) {
      // Erreur de notre côté : on journalise, le job de rattrapage reprendra la transaction
      console.error("[mypvit callback] erreur de traitement:", err);
    }
  }

  // Accusé de réception dans tous les cas : écho de transactionId et code.
  res.status(200).json({
    transactionId: payload?.transactionId,
    responseCode: payload?.code,
  });
});

/**
 * Réception asynchrone de la clé secrète après un appel à /renew-secret.
 * URL à enregistrer dans le dashboard MyPVit (menu URL), le code obtenu va
 * dans MYPVIT_RECEPTION_URL_CODE. Le format exact du payload varie selon les
 * comptes MyPVit : on essaie plusieurs noms de champ, et le corps brut en dernier recours.
 */
router.post("/mypvit/secret", requireMypvitWebhookAllowlist, async (req, res) => {
  try {
    const body = req.body;
    const secret =
      (typeof body === "string" ? body : null) ||
      body?.secret ||
      body?.secretKey ||
      body?.secret_key ||
      body?.key;

    if (secret && typeof secret === "string") {
      receiveSecretFromWebhook(secret, body?.expires_in || body?.expiresIn);
    } else {
      console.warn("[mypvit secret webhook] payload reçu sans clé reconnaissable:", JSON.stringify(body));
    }

    res.status(200).json({ responseCode: 200, message: "Secret received" });
  } catch (err: any) {
    console.error("[mypvit secret webhook] erreur de traitement:", err);
    res.status(200).json({ responseCode: 200 });
  }
});

export default router;

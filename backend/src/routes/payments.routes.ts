import { Router } from "express";
import { handleMypvitCallback } from "../modules/payments/payment.service";
import { receiveSecretFromWebhook } from "../modules/payments/mypvit.client";

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

/**
 * Réception asynchrone de la clé secrète après un appel à /renew-secret.
 * URL à enregistrer dans le dashboard MyPVit (menu URL), le code obtenu va
 * dans MYPVIT_RECEPTION_URL_CODE. Le format exact du payload varie selon les
 * comptes MyPVit (constaté sur des intégrations similaires) : on essaie
 * plusieurs noms de champ, et le corps brut en dernier recours.
 */
router.post("/mypvit/secret", async (req, res) => {
  try {
    const body = req.body;
    const secret =
      (typeof body === "string" ? body : null) ||
      body?.secret ||
      body?.secretKey ||
      body?.secret_key ||
      body?.key;

    // Si MyPVit précise à quel compte appartient ce secret (formats possibles
    // observés sur des intégrations similaires), on l'utilise pour router
    // vers le bon compte plutôt que de deviner — voir receiveSecretFromWebhook.
    const accountCode =
      body?.operation_account_code || body?.operationAccountCode || body?.merchant_operation_account_code || null;

    if (secret && typeof secret === "string") {
      receiveSecretFromWebhook(secret, body?.expires_in || body?.expiresIn, accountCode);
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

import { Request, Response, NextFunction } from "express";

/**
 * Filtre les appels webhook MyPVit par adresse IP source.
 *
 * MyPVit ne signe pas ses callbacks (pas de HMAC documenté) — le seul
 * mécanisme de confiance qu'ils documentent est de restreindre l'accès par
 * IP. On lit la liste depuis MYPVIT_WEBHOOK_ALLOWED_IPS (séparées par des
 * virgules), à demander au support MyPVit / à relever dans leur dashboard.
 *
 * Tant que la variable n'est pas configurée, ce middleware laisse tout
 * passer mais log un avertissement à chaque appel — ça évite de casser le
 * développement local, mais ça doit être rempli avant la mise en production :
 * sans ça, n'importe qui connaissant l'URL du callback peut simuler un
 * paiement "SUCCESS" pour une transaction PENDING existante.
 */
export function verifyMypvitWebhookIp(req: Request, res: Response, next: NextFunction) {
  const allowlist = (process.env.MYPVIT_WEBHOOK_ALLOWED_IPS ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (allowlist.length === 0) {
    console.warn(
      "[verifyMypvitWebhookIp] MYPVIT_WEBHOOK_ALLOWED_IPS n'est pas configuré — webhook MyPVit accepté sans filtrage IP. " +
        "À ne jamais laisser ainsi en production : demande les IP sources au support MyPVit."
    );
    return next();
  }

  // req.ip respecte "trust proxy" (déjà activé dans app.ts) donc lit bien
  // l'IP réelle du client via X-Forwarded-For derrière le reverse proxy.
  const callerIp = req.ip ?? "";
  const normalizedCallerIp = callerIp.replace(/^::ffff:/, ""); // adresses IPv4-mapped-IPv6

  if (!allowlist.includes(normalizedCallerIp)) {
    console.error(`[verifyMypvitWebhookIp] Webhook MyPVit refusé : IP non autorisée (${normalizedCallerIp})`);
    return res.status(403).json({ error: "IP non autorisée" });
  }

  next();
}

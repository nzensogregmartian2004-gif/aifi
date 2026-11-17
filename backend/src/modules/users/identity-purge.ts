import fs from "fs/promises";
import path from "path";
import { prisma } from "../../db/client";
import { UPLOAD_DIR } from "../../middleware/upload";

/**
 * Supprime les pièces d'identité d'un client : recto, verso, documents supplémentaires
 * et images envoyées dans la messagerie (où le message de bienvenue demande les pièces).
 *
 * Conservé volontairement :
 *  - les justificatifs de paiement (remboursements, retraits, déclarations) : pièces comptables ;
 *  - les lignes Upload, car leur empreinte SHA-256 sert à la liste noire et à la détection
 *    des pièces déjà utilisées par un autre compte. Seul le fichier disparaît.
 *
 * Le texte des messages est conservé, seul le lien vers l'image est retiré.
 * Retourne le nombre de fichiers supprimés du disque.
 */
export async function purgeIdentityFiles(userId: string): Promise<number> {
  const [repayments, withdrawals, declarations] = await Promise.all([
    prisma.repayment.findMany({
      where: { proofImageUrl: { not: null }, aidRequest: { userId } },
      select: { proofImageUrl: true },
    }),
    prisma.withdrawal.findMany({ where: { userId, proofImageUrl: { not: null } }, select: { proofImageUrl: true } }),
    prisma.repaymentDeclaration.findMany({ where: { userId, proofImageUrl: { not: null } }, select: { proofImageUrl: true } }),
  ]);
  const keep = new Set([...repayments, ...withdrawals, ...declarations].map((r) => r.proofImageUrl as string));

  const verification = await prisma.identityVerification.findUnique({ where: { userId } });
  const messages = await prisma.message.findMany({
    where: { clientId: userId, imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  const uploads = await prisma.upload.findMany({ where: { ownerId: userId }, select: { url: true } });

  const candidates = new Set<string>([
    ...(verification ? [verification.frontUrl, verification.backUrl, verification.selfieUrl, ...verification.extraUrls] : [])
      .filter((u): u is string => !!u),
    ...messages.map((m) => m.imageUrl as string),
    ...uploads.map((u) => u.url),
  ]);
  const toDelete = [...candidates].filter((url) => !keep.has(url));

  let deleted = 0;
  for (const url of toDelete) {
    // Seuls les noms produits par le téléversement sont acceptés : aucune traversée de dossier.
    if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(url)) continue;
    try {
      await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
      deleted++;
    } catch (err: any) {
      if (err?.code !== "ENOENT") console.error("[purge] suppression impossible :", url, err?.message);
    }
  }

  await prisma.message.updateMany({
    where: { clientId: userId, imageUrl: { in: toDelete } },
    data: { imageUrl: null },
  });

  // La fiche de vérification pointe vers des fichiers désormais supprimés : on la retire.
  if (verification) {
    await prisma.identityVerification.delete({ where: { userId } });
  }

  return deleted;
}

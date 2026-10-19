import { prisma } from "../../db/client";

// Seuls les chemins produits par notre téléversement sont acceptés (/uploads/<nom>)
export const UPLOAD_PATH_REGEX = /^\/uploads\/[A-Za-z0-9._-]+$/;

/**
 * Vérifie qu'un fichier joint par un client lui appartient bien.
 * Sans ce contrôle, un client pouvait joindre l'URL d'un document d'un autre client.
 */
export async function assertOwnUpload(url: string | undefined | null, userId: string): Promise<void> {
  if (!url) return;
  if (!UPLOAD_PATH_REGEX.test(url)) {
    throw new Error("Fichier joint invalide.");
  }
  const owned = await prisma.upload.findFirst({ where: { url, ownerId: userId } });
  if (!owned) {
    throw new Error("Ce fichier ne peut pas être joint. Envoie une nouvelle photo depuis l'application.");
  }
}

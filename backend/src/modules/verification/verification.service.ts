import { checkVerification } from "../blacklist/blacklist.service";
import { prisma } from "../../db/client";
import { assertOwnUpload } from "../uploads/upload-ownership";

export async function getMyVerification(userId: string) {
  return prisma.identityVerification.findUnique({ where: { userId } });
}

export async function submitVerification(
  userId: string,
  input: { documentType: string; frontUrl: string; backUrl?: string; extraUrls: string[] }
) {
  const existing = await prisma.identityVerification.findUnique({ where: { userId } });
  if (existing?.status === "APPROVED") {
    throw new Error("Ton identité est déjà vérifiée.");
  }

  // Le verso est obligatoire, sauf pour le passeport (une seule page photo).
  if (input.documentType !== "PASSPORT" && !input.backUrl) {
    throw new Error("Ajoute la photo du verso de ta pièce d'identité.");
  }

  // Chaque fichier doit avoir été envoyé par ce client (sinon on pourrait joindre le fichier d'un autre).
  for (const url of [input.frontUrl, input.backUrl, ...input.extraUrls]) {
    await assertOwnUpload(url, userId);
  }

  const urls = [input.frontUrl, input.backUrl, ...input.extraUrls].filter((u): u is string => !!u);
  const riskFlags = await checkVerification(userId, urls);

  const data = {
    documentType: input.documentType,
    frontUrl: input.frontUrl,
    backUrl: input.backUrl ?? null,
    extraUrls: input.extraUrls,
    status: "PENDING",
    reviewNote: null,
    reviewedAt: null,
    riskFlags,
  };

  return prisma.identityVerification.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

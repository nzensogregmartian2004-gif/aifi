import { AppError } from "../../errors";

/**
 * Un numéro de téléphone ne peut appartenir qu'à un seul compte : la connexion se fait par
 * numéro + mot de passe. Côté administration, on indique à qui appartient le numéro, pour
 * savoir quel compte libérer. Côté public, on ne révèle jamais le titulaire.
 */
export async function assertPhoneAvailable(
  db: any,
  phone: string,
  options: { exceptUserId?: string; revealOwner: boolean }
): Promise<void> {
  if (await db.blacklistEntry.findFirst({ where: { removedAt: null, phone }, select: { id: true } })) {
    throw new AppError("PHONE_BLACKLISTED", "Ce numéro est sur la liste noire.");
  }
  const owner = await db.user.findUnique({ where: { phone }, select: { id: true, name: true, role: true } });
  if (!owner || owner.id === options.exceptUserId) return;
  if (!options.revealOwner) {
    throw new AppError("PHONE_ALREADY_USED", "Ce numéro est déjà utilisé.");
  }
  if (owner.role === "ADMIN") {
    throw new AppError("PHONE_TAKEN_BY_ADMIN", `Ce numéro est déjà utilisé par le compte administrateur « ${owner.name} ».`, { name: owner.name });
  }
  throw new AppError("PHONE_TAKEN_BY_CLIENT", `Ce numéro est déjà utilisé par le compte client « ${owner.name} ».`, { name: owner.name });
}

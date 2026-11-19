import { AppError } from "../../errors";

/**
 * Lit le réglage envoyé par l'application : `pushEnabled` doit être un booléen strict.
 * `"true"`, `1` ou un champ absent sont refusés, pour ne jamais activer les push par erreur.
 */
export function parsePushEnabled(body: unknown): boolean {
  const value = (body as { pushEnabled?: unknown } | null | undefined)?.pushEnabled;
  if (typeof value !== "boolean") {
    throw new AppError("INVALID_SETTING", "Valeur attendue : pushEnabled (true ou false)");
  }
  return value;
}

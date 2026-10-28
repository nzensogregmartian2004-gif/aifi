/**
 * Erreur métier avec un code stable et des paramètres. Le serveur renvoie le message
 * français (repli) ; l'application traduit à partir du code.
 */
export class AppError extends Error {
  code: string;
  params?: Record<string, unknown>;
  constructor(code: string, message: string, params?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.params = params;
  }
}

/** Corps de réponse d'erreur : message (repli), code et paramètres. */
export function errorBody(err: any) {
  // Doublon (contrainte unique) : message lisible au lieu du texte technique de Prisma
  if (err?.code === "P2002") {
    return { error: "Cet élément existe déjà (numéro déjà utilisé ?).", code: "DUPLICATE" };
  }
  // Autre erreur de base de données : détail gardé dans les logs serveur, message générique côté app
  if (typeof err?.constructor?.name === "string" && err.constructor.name.startsWith("Prisma")) {
    console.error("[db]", err?.message);
    return { error: "Erreur de base de données. Réessaie ; si ça persiste, contacte le support.", code: "DB_ERROR" };
  }
  return {
    error: err?.message ?? "Une erreur est survenue.",
    code: err?.code,
    params: err?.params,
  };
}

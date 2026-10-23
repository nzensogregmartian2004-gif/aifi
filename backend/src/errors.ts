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
  return {
    error: err?.message ?? "Une erreur est survenue.",
    code: err?.code,
    params: err?.params,
  };
}

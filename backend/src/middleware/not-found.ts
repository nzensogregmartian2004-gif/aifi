import type { Request, Response } from "express";

/**
 * 404 JSON pour toute route /api inconnue.
 * Sans ce gestionnaire, Express répond une page HTML « Cannot GET … » que l'application
 * ne sait pas lire : l'erreur devient alors « Une erreur est survenue ».
 * Ici, la réponse nomme la méthode et le chemin exacts de la requête.
 */
export function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route introuvable : ${req.method} ${req.originalUrl}`,
    code: "ROUTE_NOT_FOUND",
    method: req.method,
    path: req.originalUrl,
  });
}

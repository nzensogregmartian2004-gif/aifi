import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Valide req.body contre un schéma Zod. En cas d'échec, renvoie une erreur 400
 * lisible plutôt que de laisser une exception non gérée remonter (montant
 * envoyé comme texte, champ manquant, valeur négative inattendue, etc.).
 * En cas de succès, remplace req.body par la version "parsed" (types coercés,
 * champs inconnus retirés) pour que le reste du code manipule des données sûres.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        error: `Donnée invalide : ${firstIssue.path.join(".") || "corps de la requête"} — ${firstIssue.message}`,
      });
    }
    req.body = result.data;
    next();
  };
}

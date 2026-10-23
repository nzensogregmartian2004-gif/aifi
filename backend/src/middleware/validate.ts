import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Valide req.body contre un schéma Zod. En cas d'échec : 400 avec un code VALIDATION
 * et le champ concerné (l'application traduit). En cas de succès, remplace req.body
 * par la version "parsed" (types coercés, champs inconnus retirés).
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const field = firstIssue.path.join(".") || "body";
      return res.status(400).json({
        error: `Donnée invalide : ${field} — ${firstIssue.message}`,
        code: "VALIDATION",
        params: { field },
      });
    }
    req.body = result.data;
    next();
  };
}

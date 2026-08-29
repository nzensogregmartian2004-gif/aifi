import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/client";

export interface AuthPayload {
  userId: string;
  role: "CLIENT" | "ADMIN";
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }

  const token = header.slice("Bearer ".length);

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }

  // Le statut du compte peut avoir changé APRÈS l'émission du token (compte
  // suspendu manuellement par un admin, ou bloqué automatiquement pour retard
  // de paiement — voir account-block.job.ts). Sans cette vérification, un
  // token déjà émis restait utilisable jusqu'à 7 jours peu importe le statut
  // réel du compte : un blocage n'avait donc aucun effet sur une session déjà
  // ouverte.
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { status: true } });
    if (!user || user.status === "SUSPENDED") {
      return res.status(403).json({ error: "Compte suspendu. Contacte l'administrateur." });
    }
  } catch {
    return res.status(503).json({ error: "Service temporairement indisponible" });
  }

  req.auth = payload;
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}
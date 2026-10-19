import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/client";

export interface AuthPayload {
  userId: string;
  role: "CLIENT" | "ADMIN";
  // Absent sur les anciens tokens : traité comme 0.
  tokenVersion?: number;
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

  // Statut ET rôle relus en base à chaque requête : une suspension ou une
  // rétrogradation prend effet tout de suite, sans attendre l'expiration du token.
  let user: { status: string; role: string; tokenVersion: number } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { status: true, role: true, tokenVersion: true },
    });
  } catch {
    return res.status(503).json({ error: "Service temporairement indisponible" });
  }

  if (!user || user.status === "SUSPENDED") {
    return res.status(403).json({ error: "Compte suspendu. Contacte l'administrateur." });
  }

  // Mot de passe changé ou réinitialisé depuis l'émission du token : session révoquée.
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
    return res.status(401).json({ error: "Session expirée. Reconnecte-toi." });
  }

  req.auth = { userId: payload.userId, role: user.role as AuthPayload["role"] };
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

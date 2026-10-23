import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/client";

export interface AuthPayload {
  userId: string;
  role: "CLIENT" | "ADMIN";
  // Absent sur les anciens tokens : traité comme 0.
  tokenVersion?: number;
  isSuperAdmin?: boolean;
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
    return res.status(401).json({ error: "Token manquant", code: "TOKEN_MISSING" });
  }

  const token = header.slice("Bearer ".length);

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré", code: "TOKEN_INVALID" });
  }

  // Statut ET rôle relus en base à chaque requête : une suspension ou une
  // rétrogradation prend effet tout de suite, sans attendre l'expiration du token.
  let user: { status: string; role: string; tokenVersion: number; isSuperAdmin: boolean } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { status: true, role: true, tokenVersion: true, isSuperAdmin: true },
    });
  } catch {
    return res.status(503).json({ error: "Service temporairement indisponible" });
  }

  if (!user || user.status === "SUSPENDED") {
    return res.status(403).json({ error: "Compte suspendu. Contacte l'administrateur.", code: "ACCOUNT_SUSPENDED" });
  }

  // Mot de passe changé ou réinitialisé depuis l'émission du token : session révoquée.
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
    return res.status(401).json({ error: "Session expirée. Reconnecte-toi.", code: "SESSION_EXPIRED" });
  }

  // Présence : dernière activité, écrite au plus une fois toutes les 2 minutes (sans bloquer la requête).
  const presenceThreshold = new Date(Date.now() - 2 * 60 * 1000);
  prisma.user
    .updateMany({
      where: { id: payload.userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: presenceThreshold } }] },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  req.auth = { userId: payload.userId, role: user.role as AuthPayload["role"], isSuperAdmin: user.isSuperAdmin };
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

import { Request, Response, NextFunction } from "express";

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN" || !req.auth?.isSuperAdmin) {
    return res.status(403).json({ error: "Action réservée au super-administrateur", code: "SUPER_ADMIN_ONLY" });
  }
  next();
}

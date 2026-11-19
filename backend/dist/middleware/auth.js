"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.signToken = signToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const client_1 = require("../db/client");
async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token manquant", code: "TOKEN_MISSING" });
    }
    const token = header.slice("Bearer ".length);
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    }
    catch {
        return res.status(401).json({ error: "Token invalide ou expiré", code: "TOKEN_INVALID" });
    }
    // Statut ET rôle relus en base à chaque requête : une suspension ou une
    // rétrogradation prend effet tout de suite, sans attendre l'expiration du token.
    let user = null;
    try {
        user = await client_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { status: true, role: true, tokenVersion: true, isSuperAdmin: true },
        });
    }
    catch {
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
    client_1.prisma.user
        .updateMany({
        where: { id: payload.userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: presenceThreshold } }] },
        data: { lastSeenAt: new Date() },
    })
        .catch(() => { });
    req.auth = { userId: payload.userId, role: user.role, isSuperAdmin: user.isSuperAdmin };
    next();
}
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, { expiresIn: "7d" });
}

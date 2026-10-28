"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
function requireAdmin(req, res, next) {
    if (req.auth?.role !== "ADMIN") {
        return res.status(403).json({ error: "Accès réservé à l'administrateur" });
    }
    next();
}

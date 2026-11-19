"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSuperAdmin = requireSuperAdmin;
function requireSuperAdmin(req, res, next) {
    if (req.auth?.role !== "ADMIN" || !req.auth?.isSuperAdmin) {
        return res.status(403).json({ error: "Action réservée au super-administrateur", code: "SUPER_ADMIN_ONLY" });
    }
    next();
}

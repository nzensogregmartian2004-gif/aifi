"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// Garde-fous statiques : chaque action sensible doit être protégée côté serveur,
// pas seulement masquée dans l'application.
const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(process.cwd(), "src/routes/admin.routes.ts"), "utf8");
function routeSlice(header, length = 500) {
    const i = src.indexOf(header);
    strict_1.default.ok(i >= 0, `route introuvable : ${header}`);
    return src.slice(i, i + length);
}
(0, node_test_1.describe)("garde-fous super administrateur (routes admin)", () => {
    (0, node_test_1.test)("cadeaux (création et historique) : réservés au super administrateur", () => {
        strict_1.default.ok(routeSlice('router.post("/gifts"').includes("requireSuperAdmin"));
        strict_1.default.ok(routeSlice('router.get("/gifts"').includes("requireSuperAdmin"));
    });
    (0, node_test_1.test)("bonus de points : réservé au super administrateur", () => {
        strict_1.default.ok(routeSlice('router.post("/users/:id/bonus"').includes("requireSuperAdmin"));
    });
    (0, node_test_1.test)("points, plafond et numéro d'un client : refusés aux administrateurs non super", () => {
        const block = routeSlice('router.patch("/users/:id"', 900);
        strict_1.default.ok(block.includes("SUPER_ADMIN_ONLY"));
        strict_1.default.ok(block.includes("isSuperAdmin"));
    });
    (0, node_test_1.test)("création d'administrateur, statut super, suspension et mot de passe : réservés au super", () => {
        strict_1.default.ok(routeSlice('router.post("/admins", requireSuperAdmin').includes("requireSuperAdmin"));
        strict_1.default.ok(routeSlice('router.patch("/admins/:id/super"').includes("requireSuperAdmin"));
        strict_1.default.ok(routeSlice('router.patch("/admins/:id/status"').includes("requireSuperAdmin"));
        strict_1.default.ok(routeSlice('router.post("/admins/:id/reset-password"').includes("requireSuperAdmin"));
    });
});

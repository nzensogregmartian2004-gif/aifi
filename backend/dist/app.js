"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_routes_1 = __importDefault(require("./routes/client.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const notifications_routes_1 = __importDefault(require("./routes/notifications.routes"));
const account_routes_1 = __importDefault(require("./routes/account.routes"));
const uploads_routes_1 = __importDefault(require("./routes/uploads.routes"));
const uploads_serve_routes_1 = __importDefault(require("./routes/uploads.serve.routes"));
const payments_routes_1 = __importDefault(require("./routes/payments.routes"));
const verifyWebhookIp_1 = require("./middleware/verifyWebhookIp");
exports.app = (0, express_1.default)();
// Render place le serveur derrière un reverse proxy : on lui fait confiance
// pour que express-rate-limit identifie correctement l'IP réelle du client
// via X-Forwarded-For, plutôt que de tout compter comme une seule IP (le proxy).
exports.app.set("trust proxy", 1);
// L'app mobile ne passe pas par CORS. Seules les origines listées dans CORS_ORIGINS
// (séparées par des virgules) peuvent appeler l'API depuis un navigateur ; par défaut, aucune.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
exports.app.use((0, cors_1.default)({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }));
exports.app.use(express_1.default.json());
// Documents sensibles (pièces d'identité, selfies, justificatifs) : servis
// derrière une authentification + vérification de propriété, plus jamais en
// statique ouvert à tout le monde (voir uploads.serve.routes.ts).
exports.app.use("/uploads", uploads_serve_routes_1.default);
// Filet de sécurité général : évite qu'un script tape l'API en boucle sur
// n'importe quelle route. Les routes sensibles (login, register) ont en plus
// leur propre limite, plus stricte.
exports.app.use("/api", (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: 120, // 120 requêtes / minute / IP, large pour un usage normal
    // Callbacks MyPVit depuis une IP autorisée : pas de limite, sinon des paiements seraient perdus
    skip: (req) => req.path.startsWith("/payments/mypvit") && (0, verifyWebhookIp_1.isAllowlistedMypvitIp)(req),
    standardHeaders: true,
    legacyHeaders: false,
}));
exports.app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
exports.app.use("/api/auth", auth_routes_1.default);
exports.app.use("/api/client", client_routes_1.default);
exports.app.use("/api/admin", admin_routes_1.default);
exports.app.use("/api/notifications", notifications_routes_1.default);
exports.app.use("/api/account", account_routes_1.default);
exports.app.use("/api/uploads", uploads_routes_1.default);
exports.app.use("/api/payments", payments_routes_1.default);
// Gestion des erreurs non catchées dans les routes
exports.app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Erreur interne du serveur" });
});

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import clientRoutes from "./routes/client.routes";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import notificationsRoutes from "./routes/notifications.routes";
import accountRoutes from "./routes/account.routes";
import uploadsRoutes from "./routes/uploads.routes";
import uploadsServeRoutes from "./routes/uploads.serve.routes";
import paymentsRoutes from "./routes/payments.routes";
import { isAllowlistedMypvitIp } from "./middleware/verifyWebhookIp";

export const app = express();

// Render place le serveur derrière un reverse proxy : on lui fait confiance
// pour que express-rate-limit identifie correctement l'IP réelle du client
// via X-Forwarded-For, plutôt que de tout compter comme une seule IP (le proxy).
app.set("trust proxy", 1);

// L'app mobile ne passe pas par CORS. Seules les origines listées dans CORS_ORIGINS
// (séparées par des virgules) peuvent appeler l'API depuis un navigateur ; par défaut, aucune.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }));
app.use(express.json());
// Documents sensibles (pièces d'identité, selfies, justificatifs) : servis
// derrière une authentification + vérification de propriété, plus jamais en
// statique ouvert à tout le monde (voir uploads.serve.routes.ts).
app.use("/uploads", uploadsServeRoutes);

// Filet de sécurité général : évite qu'un script tape l'API en boucle sur
// n'importe quelle route. Les routes sensibles (login, register) ont en plus
// leur propre limite, plus stricte.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120, // 120 requêtes / minute / IP, large pour un usage normal
    // Callbacks MyPVit depuis une IP autorisée : pas de limite, sinon des paiements seraient perdus
    skip: (req) => req.path.startsWith("/payments/mypvit") && isAllowlistedMypvitIp(req),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/payments", paymentsRoutes);

// Gestion des erreurs non catchées dans les routes
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur" });
});
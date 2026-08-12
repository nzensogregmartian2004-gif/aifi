import express from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import clientRoutes from "./routes/client.routes";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import notificationsRoutes from "./routes/notifications.routes";
import accountRoutes from "./routes/account.routes";
import uploadsRoutes from "./routes/uploads.routes";
import paymentsRoutes from "./routes/payments.routes";

export const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Filet de sécurité général : évite qu'un script tape l'API en boucle sur
// n'importe quelle route. Les routes sensibles (login, register) ont en plus
// leur propre limite, plus stricte.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120, // 120 requêtes / minute / IP, large pour un usage normal
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
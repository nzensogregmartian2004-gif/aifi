import { parsePushEnabled } from "../modules/notifications/push-settings-input";
import { errorBody } from "../errors";
import { prisma } from "../db/client";
import { SUPPORTED_LANGUAGES } from "../notifications/templates";
import { AppError } from "../errors";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { changePassword } from "../modules/users/auth.controller";
import { savePushToken, getNotificationSettings, setPushEnabled } from "../modules/notifications/notification.service";
import { validateBody } from "../middleware/validate";
import { changePasswordSchema } from "../validation/schemas";

const router = Router();

router.use(requireAuth);

// Statut du compte relu en base après validation/réactivation administrative.
router.get("/me", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, name: true, phone: true, role: true, status: true, isSuperAdmin: true },
    });
    if (!user) return res.status(401).json({ error: "Session expirée.", code: "SESSION_EXPIRED" });
    if (user.status === "SUSPENDED") {
      return res.status(403).json({ error: "Compte suspendu", code: "ACCOUNT_SUSPENDED" });
    }
    return res.json({ user });
  } catch (err: any) {
    return res.status(500).json(errorBody(err));
  }
});

// Ping de présence (requireAuth met déjà lastSeenAt à jour). Il transmet aussi la langue
// de l'app : les notifications suivantes seront écrites dans cette langue.
router.post("/heartbeat", async (req, res) => {
  const language = req.body?.language;
  try {
    if (typeof language === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
      await prisma.user.updateMany({
        where: { id: req.auth!.userId, language: { not: language } },
        data: { language },
      });
    }
  } catch (err) {
    console.error("[heartbeat] langue non enregistrée :", err);
  }
  res.json({ ok: true });
});

router.post("/change-password", validateBody(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await changePassword(req.auth!.userId, currentPassword, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Activer / désactiver les notifications push (depuis le tableau de bord client ou admin).
router.get("/notification-settings", async (req, res) => {
  try {
    res.json(await getNotificationSettings(req.auth!.userId));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

const notificationSettingsHandler = async (req: import("express").Request, res: import("express").Response) => {
  try {
    const pushEnabled = parsePushEnabled(req.body);
    res.json(await setPushEnabled(req.auth!.userId, pushEnabled));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
};
router.put("/notification-settings", notificationSettingsHandler);
router.patch("/notification-settings", notificationSettingsHandler);

router.post("/push-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) throw new AppError("TOKEN_MISSING", "Token manquant");
    const result = await savePushToken(req.auth!.userId, token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

export default router;

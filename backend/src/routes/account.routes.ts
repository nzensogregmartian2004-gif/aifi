import { errorBody } from "../errors";
import { prisma } from "../db/client";
import { SUPPORTED_LANGUAGES } from "../notifications/templates";
import { AppError } from "../errors";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { changePassword } from "../modules/users/auth.controller";
import { savePushToken } from "../modules/notifications/notification.service";
import { validateBody } from "../middleware/validate";
import { changePasswordSchema } from "../validation/schemas";

const router = Router();

router.use(requireAuth);

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

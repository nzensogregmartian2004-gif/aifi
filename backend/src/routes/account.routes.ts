import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { changePassword } from "../modules/users/auth.controller";
import { savePushToken } from "../modules/notifications/notification.service";
import { validateBody } from "../middleware/validate";
import { changePasswordSchema } from "../validation/schemas";

const router = Router();

router.use(requireAuth);

// Ping de présence : requireAuth met déjà lastSeenAt à jour, la route répond simplement.
router.post("/heartbeat", (_req, res) => {
  res.json({ ok: true });
});

router.post("/change-password", validateBody(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await changePassword(req.auth!.userId, currentPassword, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/push-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) throw new Error("Token manquant");
    const result = await savePushToken(req.auth!.userId, token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

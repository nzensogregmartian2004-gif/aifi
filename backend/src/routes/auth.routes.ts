import { Router } from "express";
import { AuthError, login, logout, register } from "../modules/users/auth.controller";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimiters";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { clientIp } from "../middleware/verifyWebhookIp";
import { errorBody } from "../errors";
import { registerSchema, loginSchema } from "../validation/schemas";

const router = Router();

// Les erreurs passent par errorBody : jamais le texte brut d'une erreur Prisma
// (qui révélerait par exemple qu'un numéro est déjà enregistré).
router.post("/register", registerRateLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { name, phone, password, referralCode } = req.body;
    const user = await register(name, phone, password, referralCode);
    res.json({ id: user.id, referralCode: user.referralCode });
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/login", loginRateLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { phone, password } = req.body;
    const result = await login(phone, password, clientIp(req));
    res.json(result);
  } catch (err: any) {
    // 401 pour les refus métier (mauvais mot de passe, compte suspendu...), 500 pour le reste
    res.status(err instanceof AuthError ? 401 : 500).json(errorBody(err));
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  try {
    res.json(await logout(req.auth!.userId));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

export default router;

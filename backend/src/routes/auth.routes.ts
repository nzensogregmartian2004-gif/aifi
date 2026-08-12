import { Router } from "express";
import { login, register } from "../modules/users/auth.controller";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimiters";
import { validateBody } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validation/schemas";

const router = Router();

router.post("/register", registerRateLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { name, phone, password, referralCode } = req.body;
    const user = await register(name, phone, password, referralCode);
    res.json({ id: user.id, referralCode: user.referralCode });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/login", loginRateLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { phone, password } = req.body;
    const result = await login(phone, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

export default router;
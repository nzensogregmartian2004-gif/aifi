"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../modules/users/auth.controller");
const rateLimiters_1 = require("../middleware/rateLimiters");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const verifyWebhookIp_1 = require("../middleware/verifyWebhookIp");
const errors_1 = require("../errors");
const schemas_1 = require("../validation/schemas");
const router = (0, express_1.Router)();
// Les erreurs passent par errorBody : jamais le texte brut d'une erreur Prisma
// (qui révélerait par exemple qu'un numéro est déjà enregistré).
router.post("/register", rateLimiters_1.registerRateLimiter, (0, validate_1.validateBody)(schemas_1.registerSchema), async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;
        const user = await (0, auth_controller_1.register)(name, phone, password, referralCode);
        res.json({ id: user.id, referralCode: user.referralCode });
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/login", rateLimiters_1.loginRateLimiter, (0, validate_1.validateBody)(schemas_1.loginSchema), async (req, res) => {
    try {
        const { phone, password } = req.body;
        const result = await (0, auth_controller_1.login)(phone, password, (0, verifyWebhookIp_1.clientIp)(req));
        res.json(result);
    }
    catch (err) {
        // 401 pour les refus métier (mauvais mot de passe, compte suspendu...), 500 pour le reste
        res.status(err instanceof auth_controller_1.AuthError ? 401 : 500).json((0, errors_1.errorBody)(err));
    }
});
router.post("/logout", auth_1.requireAuth, async (req, res) => {
    try {
        res.json(await (0, auth_controller_1.logout)(req.auth.userId));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../modules/users/auth.controller");
const rateLimiters_1 = require("../middleware/rateLimiters");
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validation/schemas");
const router = (0, express_1.Router)();
router.post("/register", rateLimiters_1.registerRateLimiter, (0, validate_1.validateBody)(schemas_1.registerSchema), async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;
        const user = await (0, auth_controller_1.register)(name, phone, password, referralCode);
        res.json({ id: user.id, referralCode: user.referralCode });
    }
    catch (err) {
        res.status(400).json({ error: err.message, code: err.code });
    }
});
router.post("/login", rateLimiters_1.loginRateLimiter, (0, validate_1.validateBody)(schemas_1.loginSchema), async (req, res) => {
    try {
        const { phone, password } = req.body;
        const result = await (0, auth_controller_1.login)(phone, password);
        res.json(result);
    }
    catch (err) {
        res.status(401).json({ error: err.message, code: err.code, params: err.params });
    }
});
exports.default = router;

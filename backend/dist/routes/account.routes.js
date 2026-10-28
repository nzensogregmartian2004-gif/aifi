"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("../errors");
const client_1 = require("../db/client");
const templates_1 = require("../notifications/templates");
const errors_2 = require("../errors");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const auth_controller_1 = require("../modules/users/auth.controller");
const notification_service_1 = require("../modules/notifications/notification.service");
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validation/schemas");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
// Ping de présence (requireAuth met déjà lastSeenAt à jour). Il transmet aussi la langue
// de l'app : les notifications suivantes seront écrites dans cette langue.
router.post("/heartbeat", async (req, res) => {
    const language = req.body?.language;
    try {
        if (typeof language === "string" && templates_1.SUPPORTED_LANGUAGES.includes(language)) {
            await client_1.prisma.user.updateMany({
                where: { id: req.auth.userId, language: { not: language } },
                data: { language },
            });
        }
    }
    catch (err) {
        console.error("[heartbeat] langue non enregistrée :", err);
    }
    res.json({ ok: true });
});
router.post("/change-password", (0, validate_1.validateBody)(schemas_1.changePasswordSchema), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await (0, auth_controller_1.changePassword)(req.auth.userId, currentPassword, newPassword);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/push-token", async (req, res) => {
    try {
        const { token } = req.body;
        if (!token)
            throw new errors_2.AppError("TOKEN_MISSING", "Token manquant");
        const result = await (0, notification_service_1.savePushToken)(req.auth.userId, token);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
exports.default = router;

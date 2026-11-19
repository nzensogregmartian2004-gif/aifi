"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const notification_service_1 = require("../modules/notifications/notification.service");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get("/", async (req, res) => {
    const notifications = await (0, notification_service_1.listNotifications)(req.auth.userId);
    res.json(notifications);
});
router.get("/unread-count", async (req, res) => {
    const count = await (0, notification_service_1.countUnread)(req.auth.userId);
    res.json({ count });
});
router.post("/:id/read", async (req, res) => {
    await (0, notification_service_1.markRead)(req.auth.userId, req.params.id);
    res.json({ success: true });
});
router.post("/read-all", async (req, res) => {
    await (0, notification_service_1.markAllRead)(req.auth.userId);
    res.json({ success: true });
});
exports.default = router;

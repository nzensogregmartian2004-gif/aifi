import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
} from "../modules/notifications/notification.service";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const notifications = await listNotifications(req.auth!.userId);
  res.json(notifications);
});

router.get("/unread-count", async (req, res) => {
  const count = await countUnread(req.auth!.userId);
  res.json({ count });
});

router.post("/:id/read", async (req, res) => {
  await markRead(req.auth!.userId, (req.params.id as string));
  res.json({ success: true });
});

router.post("/read-all", async (req, res) => {
  await markAllRead(req.auth!.userId);
  res.json({ success: true });
});

export default router;

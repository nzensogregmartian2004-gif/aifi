import { Router } from "express";
import { getSettings, updateSettings } from "../modules/settings/settings.service";
import { getAllTiers, upsertTier, deleteTier } from "../modules/ceilings/ceiling.service";
import { getAllDurations, addDuration, removeDuration } from "../modules/durations/duration.service";
import { validateBody } from "../middleware/validate";
import { settingsUpdateSchema, settingsCeilingSchema, settingsDurationSchema } from "../validation/schemas";

const router = Router();

router.get("/", async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.patch("/", validateBody(settingsUpdateSchema), async (req, res) => {
  try {
    const settings = await updateSettings(req.body);
    res.json(settings);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/tiers", async (_req, res) => {
  const tiers = await getAllTiers();
  res.json(tiers);
});

router.put("/tiers", validateBody(settingsCeilingSchema), async (req, res) => {
  try {
    const { minPoints, ceiling } = req.body;
    const tier = await upsertTier(minPoints, ceiling);
    res.json(tier);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/tiers/:id", async (req, res) => {
  try {
    await deleteTier((req.params.id as string));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/durations", async (_req, res) => {
  const durations = await getAllDurations();
  res.json(durations);
});

router.post("/durations", validateBody(settingsDurationSchema), async (req, res) => {
  try {
    const { days } = req.body;
    const duration = await addDuration(days);
    res.json(duration);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/durations/:id", async (req, res) => {
  try {
    await removeDuration((req.params.id as string));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
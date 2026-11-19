"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("../errors");
const express_1 = require("express");
const settings_service_1 = require("../modules/settings/settings.service");
const ceiling_service_1 = require("../modules/ceilings/ceiling.service");
const duration_tier_service_1 = require("../modules/durations/duration-tier.service");
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validation/schemas");
const router = (0, express_1.Router)();
router.get("/", async (_req, res) => {
    const settings = await (0, settings_service_1.getSettings)();
    res.json(settings);
});
router.patch("/", (0, validate_1.validateBody)(schemas_1.settingsUpdateSchema), async (req, res) => {
    try {
        const settings = await (0, settings_service_1.updateSettings)(req.body);
        res.json(settings);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/tiers", async (_req, res) => {
    const tiers = await (0, ceiling_service_1.getAllTiers)();
    res.json(tiers);
});
router.put("/tiers", (0, validate_1.validateBody)(schemas_1.settingsCeilingSchema), async (req, res) => {
    try {
        const { minPoints, ceiling } = req.body;
        const tier = await (0, ceiling_service_1.upsertTier)(minPoints, ceiling);
        res.json(tier);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.delete("/tiers/:id", async (req, res) => {
    try {
        await (0, ceiling_service_1.deleteTier)(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/duration-tiers", async (_req, res) => {
    const tiers = await (0, duration_tier_service_1.getAllDurationTiers)();
    res.json(tiers);
});
router.put("/duration-tiers", (0, validate_1.validateBody)(schemas_1.durationTierSchema), async (req, res) => {
    try {
        const { minAmount, durationDays } = req.body;
        const tier = await (0, duration_tier_service_1.upsertDurationTier)(minAmount, durationDays);
        res.json(tier);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.delete("/duration-tiers/:id", async (req, res) => {
    try {
        await (0, duration_tier_service_1.deleteDurationTier)(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
exports.default = router;

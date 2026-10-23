-- AIFI+ : abonnement trimestriel, sans multiplicateur de plafond.
-- Non-abonnés plafonnés au palier de freePointsCap points (150 par défaut).
ALTER TABLE "AppSettings" DROP COLUMN "premiumCeilingMultiplier";
ALTER TABLE "AppSettings" DROP COLUMN "premiumMaxCeiling";
ALTER TABLE "AppSettings" RENAME COLUMN "premiumMonthlyPrice" TO "premiumPrice";
ALTER TABLE "AppSettings" ADD COLUMN "premiumDurationDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "AppSettings" ADD COLUMN "freePointsCap" INTEGER NOT NULL DEFAULT 150;

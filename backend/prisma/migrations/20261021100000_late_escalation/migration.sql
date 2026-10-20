-- Retard : paliers tous les N jours (lateStepDays), blocage au jour lateBlockDays.
ALTER TABLE "AidRequest" ADD COLUMN "latePenaltySteps" INTEGER NOT NULL DEFAULT 0;

-- Les demandes déjà pénalisées (ancien système : une seule pénalité) comptent pour le premier palier.
UPDATE "AidRequest" SET "latePenaltySteps" = 1 WHERE "latePenaltyAppliedAt" IS NOT NULL;

ALTER TABLE "AppSettings"
  ADD COLUMN "lateStepDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "lateBlockDays" INTEGER NOT NULL DEFAULT 15;

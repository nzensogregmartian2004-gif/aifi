-- Remplace la durée unique par une grille montant -> durée, configurable
-- depuis l'admin. Le montant demandé est rattaché au palier immédiatement
-- inférieur (le plus grand minAmount <= montant demandé).
CREATE TABLE "DurationTier" (
    "id" TEXT NOT NULL,
    "minAmount" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,

    CONSTRAINT "DurationTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DurationTier_minAmount_key" ON "DurationTier"("minAmount");

INSERT INTO "DurationTier" ("id", "minAmount", "durationDays") VALUES
  (gen_random_uuid()::text, 500, 3),
  (gen_random_uuid()::text, 1000, 7),
  (gen_random_uuid()::text, 2000, 7),
  (gen_random_uuid()::text, 5000, 15),
  (gen_random_uuid()::text, 10000, 15),
  (gen_random_uuid()::text, 15000, 15),
  (gen_random_uuid()::text, 20000, 30),
  (gen_random_uuid()::text, 25000, 30),
  (gen_random_uuid()::text, 30000, 30),
  (gen_random_uuid()::text, 35000, 30),
  (gen_random_uuid()::text, 40000, 30),
  (gen_random_uuid()::text, 45000, 30),
  (gen_random_uuid()::text, 50000, 30),
  (gen_random_uuid()::text, 55000, 30),
  (gen_random_uuid()::text, 60000, 30);

-- L'ancien réglage unique de durée n'a plus lieu d'être, remplacé par la grille.
ALTER TABLE "AppSettings" DROP COLUMN "defaultDurationDays";

-- Trace explicitement le palier utilisé pour chaque demande (transparence
-- admin/client), en plus de dueDate qui reste la source de vérité pour les
-- calculs.
ALTER TABLE "AidRequest" ADD COLUMN "durationDays" INTEGER;
ALTER TABLE "AidRequest" ADD COLUMN "durationTierAmount" INTEGER;

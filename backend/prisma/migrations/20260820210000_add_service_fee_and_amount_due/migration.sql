-- Frais de service : ajoutés au remboursement (pas déduits à l'envoi).
-- Taux par défaut 33%, modifiable dans Paramètres.
ALTER TABLE "AppSettings" ADD COLUMN "serviceFeePercent" INTEGER NOT NULL DEFAULT 33;

-- Montant total à rembourser, figé au moment de la demande (amount + frais du
-- moment). On ne recalcule jamais après coup : changer le taux plus tard ne
-- doit pas modifier la dette de quelqu'un déjà engagé.
-- Backfill : pour les demandes déjà existantes, aucun frais n'est appliqué
-- rétroactivement (amountDue = amount), pour ne pas créer de dette surprise.
ALTER TABLE "AidRequest" ADD COLUMN "amountDue" INTEGER;
UPDATE "AidRequest" SET "amountDue" = "amount" WHERE "amountDue" IS NULL;
ALTER TABLE "AidRequest" ALTER COLUMN "amountDue" SET NOT NULL;

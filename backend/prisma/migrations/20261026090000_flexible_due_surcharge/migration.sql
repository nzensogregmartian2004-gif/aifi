-- Nouvelles règles de retard et de date de remboursement (fuseau Libreville, UTC+1) :
--  * sursis figé à la création : 1 jour clients simples, premiumGraceDays (3) pour AIFI+ ;
--  * après le sursis, pour chaque jour de retard : majoration exacte de l'intérêt journalier
--    de la grille (total arrondi au franc le plus proche) et perte de latePenaltyPoints points
--    de confiance, jusqu'à zéro ;
--  * date de remboursement choisie à partir de flexibleDueMinPoints points : de flexibleDueMinDays jours au double de la grille ;
--    une date plus courte garde le montant de la grille ;
--  * pas de blocage de compte : suppression des paliers et du délai de blocage (lateStepDays, lateBlockDays).

-- Ancien système par paliers : colonnes non utilisées désormais.
ALTER TABLE "AidRequest" DROP COLUMN "latePenaltySteps";
ALTER TABLE "AidRequest" DROP COLUMN "latePenaltyAppliedAt";
ALTER TABLE "AppSettings" DROP COLUMN "lateStepDays";
ALTER TABLE "AppSettings" DROP COLUMN "lateBlockDays";

ALTER TABLE "AppSettings" ADD COLUMN "standardGraceDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AppSettings" ADD COLUMN "flexibleDueMinPoints" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "AppSettings" ADD COLUMN "flexibleDueMinDays" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "AidRequest" ADD COLUMN "graceDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AidRequest" ADD COLUMN "interestAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AidRequest" ADD COLUMN "gridDurationDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AidRequest" ADD COLUMN "baseAmountDue" INTEGER;
ALTER TABLE "AidRequest" ADD COLUMN "lateDaysCharged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AidRequest" ADD COLUMN "lateSurchargeAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AidRequest" ADD COLUMN "lateNotifiedAt" TIMESTAMP(3);

-- Demandes existantes : le sursis AIFI+ était déjà premiumGraceDays jours.
UPDATE "AidRequest" ar
SET "graceDays" = s."premiumGraceDays"
FROM "User" u, "AppSettings" s
WHERE u."id" = ar."userId" AND u."isPremium" = true AND s."id" = 'singleton';

-- Demandes existantes : base de calcul = intérêts et durée de la grille au moment de la demande.
UPDATE "AidRequest"
SET "interestAmount" = "amountDue" - "amount",
    "gridDurationDays" = GREATEST(1, COALESCE("durationDays", ROUND(EXTRACT(EPOCH FROM ("dueDate" - "createdAt")) / 86400)::int)),
    "baseAmountDue" = "amountDue";

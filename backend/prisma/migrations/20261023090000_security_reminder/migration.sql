-- Super-administrateur : seul il crée des admins et réinitialise les données.
-- Le plus ancien administrateur existant le devient (pour ne pas bloquer l'existant).
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isSuperAdmin" = true
WHERE "id" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1);

-- Rappel d'échéance AIFI+ : échéance pour laquelle le rappel a déjà été envoyé
ALTER TABLE "User" ADD COLUMN "premiumReminderFor" TIMESTAMP(3);

-- Verrouillage de connexion persistant
CREATE TABLE "LoginAttempt" (
    "phone" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "firstAttemptAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("phone")
);

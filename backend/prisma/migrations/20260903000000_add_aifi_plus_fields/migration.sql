-- AIFI+ : statut premium du client, réglages de l'abonnement, et distinction
-- du motif d'une transaction de paiement (remboursement vs abonnement).

ALTER TABLE "User" ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "premiumSince" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "premiumExpiresAt" TIMESTAMP(3);

ALTER TABLE "AppSettings" ADD COLUMN "premiumServiceFeePercent" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "AppSettings" ADD COLUMN "premiumCeilingMultiplier" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "AppSettings" ADD COLUMN "premiumMaxCeiling" INTEGER NOT NULL DEFAULT 150000;
ALTER TABLE "AppSettings" ADD COLUMN "premiumMonthlyPrice" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "AppSettings" ADD COLUMN "premiumGraceDays" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "PaymentTransaction" ADD COLUMN "purpose" TEXT;

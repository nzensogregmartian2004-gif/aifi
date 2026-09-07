-- Numéro (Mobile Money) sur lequel le business reçoit les remboursements
-- déclarés manuellement par les clients — affiché côté client avant qu'il
-- ne déclare un envoi, configurable par l'admin (Paramètres).
ALTER TABLE "AppSettings" ADD COLUMN "repaymentReceivingOperator" TEXT NOT NULL DEFAULT 'AIRTEL_MONEY';
ALTER TABLE "AppSettings" ADD COLUMN "repaymentReceivingPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "repaymentReceivingName" TEXT NOT NULL DEFAULT '';

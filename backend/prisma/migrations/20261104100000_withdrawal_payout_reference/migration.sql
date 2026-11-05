-- Référence de l'envoi MyPVit d'un retrait, conservée pendant un envoi incertain (APPROVING),
-- pour que l'admin puisse le vérifier chez MyPVit avant de le résoudre.
ALTER TABLE "Withdrawal" ADD COLUMN "payoutReference" TEXT;
CREATE UNIQUE INDEX "Withdrawal_payoutReference_key" ON "Withdrawal"("payoutReference");

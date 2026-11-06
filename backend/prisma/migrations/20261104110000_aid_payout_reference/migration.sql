-- Référence de l'envoi MyPVit d'une aide, conservée pendant un décaissement incertain (DISBURSING).
ALTER TABLE "AidRequest" ADD COLUMN "payoutReference" TEXT;
CREATE UNIQUE INDEX "AidRequest_payoutReference_key" ON "AidRequest"("payoutReference");

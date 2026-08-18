-- Ajoute la colonne proofImageUrl, présente dans schema.prisma mais jamais
-- migrée en base (P2022 sur Repayment.proofImageUrl, Withdrawal.proofImageUrl,
-- RepaymentDeclaration.proofImageUrl).
ALTER TABLE "Repayment" ADD COLUMN "proofImageUrl" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "proofImageUrl" TEXT;
ALTER TABLE "RepaymentDeclaration" ADD COLUMN "proofImageUrl" TEXT;

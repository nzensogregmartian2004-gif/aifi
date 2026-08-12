-- RenameColumn (le montant minimum de 500 FCFA s'applique aux remboursements, pas aux demandes d'aide)
ALTER TABLE "AppSettings" RENAME COLUMN "minAidAmount" TO "minRepaymentAmount";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "pushToken" TEXT;

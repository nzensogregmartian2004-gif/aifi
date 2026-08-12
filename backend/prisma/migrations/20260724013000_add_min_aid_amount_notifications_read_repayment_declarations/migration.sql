-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "minAidAmount" INTEGER NOT NULL DEFAULT 500;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "read" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RepaymentDeclaration" (
    "id" TEXT NOT NULL,
    "aidRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RepaymentDeclaration_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RepaymentDeclaration" ADD CONSTRAINT "RepaymentDeclaration_aidRequestId_fkey" FOREIGN KEY ("aidRequestId") REFERENCES "AidRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentDeclaration" ADD CONSTRAINT "RepaymentDeclaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

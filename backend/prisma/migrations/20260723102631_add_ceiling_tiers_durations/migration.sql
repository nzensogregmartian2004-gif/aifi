-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeilingTier" (
    "id" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "ceiling" INTEGER NOT NULL,

    CONSTRAINT "CeilingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedDuration" (
    "id" TEXT NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "AllowedDuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CeilingTier_minPoints_key" ON "CeilingTier"("minPoints");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedDuration_days_key" ON "AllowedDuration"("days");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

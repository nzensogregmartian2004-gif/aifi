-- Vérification d'identité du client (pièces d'identité recto/verso + documents supplémentaires).
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "frontUrl" TEXT NOT NULL,
    "backUrl" TEXT,
    "extraUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityVerification_userId_key" ON "IdentityVerification"("userId");

ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

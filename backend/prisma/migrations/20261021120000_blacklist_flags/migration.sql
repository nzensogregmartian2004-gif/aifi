-- Empreinte des fichiers, signalements sur les dossiers d'identité, liste noire.
ALTER TABLE "Upload" ADD COLUMN "sha256" TEXT;
CREATE INDEX "Upload_sha256_idx" ON "Upload"("sha256");

ALTER TABLE "IdentityVerification" ADD COLUMN "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "nameKey" TEXT,
    "documentHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlacklistEntry_phone_idx" ON "BlacklistEntry"("phone");

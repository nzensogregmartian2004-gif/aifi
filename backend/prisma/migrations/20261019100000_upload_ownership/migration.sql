-- Propriétaire de chaque fichier téléversé. Un client ne peut joindre à ses messages
-- ou déclarations que des fichiers qu'il a lui-même envoyés.
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Upload_url_key" ON "Upload"("url");

CREATE INDEX "Upload_ownerId_idx" ON "Upload"("ownerId");

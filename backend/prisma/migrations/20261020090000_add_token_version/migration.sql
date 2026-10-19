-- Révocation des sessions : compteur de version des tokens par utilisateur.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Activation / désactivation des notifications push, par utilisateur (client et admin).
-- IF NOT EXISTS : sans effet si la colonne existe déjà.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

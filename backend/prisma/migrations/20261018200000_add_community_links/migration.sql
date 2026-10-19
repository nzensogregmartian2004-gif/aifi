-- Section communauté (message, message de partage WhatsApp, liens) affichée
-- sur le tableau de bord client, configurable par l'admin (Paramètres).
ALTER TABLE "AppSettings" ADD COLUMN "communityMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "communityShareText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "communityLinks" JSONB NOT NULL DEFAULT '[]';

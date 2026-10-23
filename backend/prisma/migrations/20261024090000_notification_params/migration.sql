-- Paramètres des notifications : le texte est rendu dans la langue de l'application.
ALTER TABLE "Notification" ADD COLUMN "params" JSONB;

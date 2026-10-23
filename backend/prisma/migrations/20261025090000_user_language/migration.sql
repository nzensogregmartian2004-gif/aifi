-- Langue de l'app de chaque client : les notifications sont écrites dans cette langue.
ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr';

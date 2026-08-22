-- Durée de remboursement par défaut, affichée au client AVANT qu'il ne
-- confirme sa demande d'aide (avec le montant total à rembourser). Modifiable
-- par l'admin, reflété immédiatement côté client (lu à chaque ouverture de
-- l'écran de demande, pas mis en cache).
ALTER TABLE "AppSettings" ADD COLUMN "defaultDurationDays" INTEGER NOT NULL DEFAULT 15;

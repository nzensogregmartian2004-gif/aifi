-- Fusion de la durée de remboursement : AllowedDuration (liste choisie par
-- l'admin à l'acceptation) est remplacée par AppSettings.defaultDurationDays
-- (une seule valeur, figée dès la demande — comme amountDue). Plus de risque
-- de désynchronisation entre deux réglages différents.
DROP TABLE IF EXISTS "AllowedDuration";

-- Informations de réception choisies par le CLIENT lui-même à sa demande
-- (opérateur, numéro, nom du compte) — l'admin ne choisit plus jamais
-- l'opérateur à sa place. Nullable : les demandes déjà existantes n'ont pas
-- cette info et repassent par l'envoi manuel le temps qu'elles se terminent.
ALTER TABLE "AidRequest" ADD COLUMN "receivingOperator" TEXT;
ALTER TABLE "AidRequest" ADD COLUMN "receivingPhone" TEXT;
ALTER TABLE "AidRequest" ADD COLUMN "receivingName" TEXT;

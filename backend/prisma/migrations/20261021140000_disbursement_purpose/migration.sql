-- Finalité explicite des décaissements. Sans finalité, une transaction est lue comme un remboursement.
-- Marque les transactions déjà créées pour un décaissement : même demande d'aide et référence = payoutReference.
UPDATE "PaymentTransaction" AS t
SET "purpose" = 'DISBURSEMENT'
FROM "AidRequest" AS a
WHERE t."aidRequestId" = a."id"
  AND t."reference" = a."payoutReference"
  AND t."purpose" IS NULL;

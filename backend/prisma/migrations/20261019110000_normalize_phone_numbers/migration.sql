-- Normalisation des numéros existants : espaces, tirets, points et parenthèses retirés.
-- Garde-fous : on ne touche pas aux comptes anonymisés, ni aux numéros dont la
-- version normalisée est partagée par un autre compte (ils restent inchangés
-- plutôt que de faire échouer la migration sur la contrainte d'unicité).
UPDATE "User" AS u
SET "phone" = regexp_replace(u."phone", '[^0-9+]', '', 'g')
WHERE u."phone" ~ '[^0-9+]'
  AND LEFT(u."phone", 9) <> 'supprime_'
  AND length(regexp_replace(u."phone", '[^0-9+]', '', 'g')) >= 6
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS o
    WHERE o."id" <> u."id"
      AND regexp_replace(o."phone", '[^0-9+]', '', 'g') = regexp_replace(u."phone", '[^0-9+]', '', 'g')
  );

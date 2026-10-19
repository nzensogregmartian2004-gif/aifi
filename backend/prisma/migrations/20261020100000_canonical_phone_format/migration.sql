-- Forme unique des numéros : « 0 » + 8 chiffres (ex. 077000000).
-- Convertit les numéros stockés en +241… / 00241… / 241… vers cette forme.
-- Garde-fous : comptes anonymisés ignorés ; si la forme cible est déjà utilisée
-- par un autre compte, la ligne reste inchangée (pas de conflit d'unicité).
WITH c AS (
  SELECT "id", "phone", regexp_replace("phone", '[^0-9]', '', 'g') AS d
  FROM "User"
  WHERE LEFT("phone", 9) <> 'supprime_'
),
t AS (
  SELECT "id",
    CASE
      WHEN d LIKE '00241%' AND length(d) = 13 THEN '0' || substr(d, 6)
      WHEN d LIKE '241%'   AND length(d) = 11 THEN '0' || substr(d, 4)
      ELSE NULL
    END AS newphone
  FROM c
)
UPDATE "User" AS u
SET "phone" = t.newphone
FROM t
WHERE u."id" = t."id"
  AND t.newphone IS NOT NULL
  AND t.newphone <> u."phone"
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS o
    WHERE o."id" <> u."id" AND o."phone" = t.newphone
  );

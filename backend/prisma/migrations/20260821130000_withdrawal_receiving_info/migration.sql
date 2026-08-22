-- Même principe que pour AidRequest : le client choisit lui-même l'opérateur
-- et le compte de réception au moment de sa demande de retrait — l'admin ne
-- choisit plus jamais l'opérateur à sa place.
ALTER TABLE "Withdrawal" ADD COLUMN "receivingOperator" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "receivingPhone" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "receivingName" TEXT;

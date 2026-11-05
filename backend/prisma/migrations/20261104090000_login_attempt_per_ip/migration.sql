-- Verrou de connexion par couple (numéro, IP) au lieu du numéro seul : un tiers ne peut plus
-- bloquer le compte d'un client en échouant depuis une autre adresse.
ALTER TABLE "LoginAttempt" ADD COLUMN "ip" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LoginAttempt" DROP CONSTRAINT "LoginAttempt_pkey";
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("phone", "ip");

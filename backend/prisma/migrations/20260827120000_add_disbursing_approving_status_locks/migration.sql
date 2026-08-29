-- Ajoute des statuts intermédiaires utilisés comme verrou atomique pendant
-- l'appel à l'API MyPVit (GIVE_CHANGE), pour empêcher un double décaissement /
-- double retrait quand deux admins (ou un double-clic) déclenchent le même
-- envoi d'argent en même temps. Voir aid-request.service.ts / withdrawal.service.ts.
--
-- Note PostgreSQL : ALTER TYPE ... ADD VALUE ne peut pas être utilisé dans la
-- même transaction qu'une requête qui référence la nouvelle valeur — mais peut
-- être exécuté seul dans une transaction (PG 12+), ce qui est le cas ici.
ALTER TYPE "AidRequestStatus" ADD VALUE IF NOT EXISTS 'DISBURSING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'APPROVING';

-- Rappels AIFI+ : un avertissement au dernier mois (30 jours) puis à la dernière semaine (7 jours),
-- au lieu d'un seul rappel à 7 jours. Le niveau déjà envoyé est mémorisé pour chaque échéance.
ALTER TABLE "User" ADD COLUMN "premiumReminderLevel" INTEGER NOT NULL DEFAULT 0;

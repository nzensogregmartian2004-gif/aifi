-- Rappel distinct envoyé le jour même de l'échéance (en plus du rappel
-- "reminderDaysBefore" déjà existant et de la pénalité de retard envoyée le
-- lendemain) — comble le silence entre les deux. Un seul envoi par demande,
-- comme reminderSentAt / latePenaltyAppliedAt.
ALTER TABLE "AidRequest" ADD COLUMN "dueTodayReminderSentAt" TIMESTAMP(3);

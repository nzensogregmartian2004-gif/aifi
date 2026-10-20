-- Série de remboursements à temps : compteur par client, paramètres du bonus.
ALTER TABLE "User" ADD COLUMN "onTimeStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings"
  ADD COLUMN "streakLength" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "streakBonusPoints" INTEGER NOT NULL DEFAULT 10;

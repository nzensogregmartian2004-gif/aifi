-- Présence des clients (dernière activité) et historique des cadeaux admin.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

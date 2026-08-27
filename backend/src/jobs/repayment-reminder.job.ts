import { prisma } from "../db/client";

/**
 * Deux rappels au total par demande, jamais plus (pour ne pas harceler le
 * client) :
 *  1. `reminderSentAt` — X jours avant l'échéance (X = settings.reminderDaysBefore).
 *  2. `dueTodayReminderSentAt` — le jour même de l'échéance, une seule fois.
 * Au-delà, si le remboursement n'est toujours pas fait, c'est la pénalité de
 * retard (late-penalty.job.ts) qui prend le relais le lendemain — pas de rappel
 * quotidien répété entre-temps.
 */
export async function sendRepaymentReminders() {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const now = new Date();
  const threshold = new Date(now.getTime() + settings.reminderDaysBefore * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED"] },
      dueDate: { lte: threshold, gt: now },
      reminderSentAt: null, // un seul rappel anticipé par demande
    },
  });

  for (const request of upcoming) {
    await prisma.$transaction(async (tx) => {
      await tx.aidRequest.update({
        where: { id: request.id },
        data: { reminderSentAt: now },
      });

      await tx.notification.create({
        data: {
          userId: request.userId,
          aidRequestId: request.id,
          type: "reminder",
          message: `Votre remboursement de ${request.amount} FCFA arrive à échéance bientôt.`,
        },
      });
    });
    // placeholder : brancher ici un envoi SMS/email réel plus tard
  }

  // Rappel du jour J : couvre le cas où l'échéance tombe le jour même, que le
  // rappel anticipé ait déjà été envoyé ou non (ex : demande créée trop tard
  // pour que le rappel à X jours ait eu l'occasion de partir).
  const dueToday = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED"] },
      dueDate: { gte: startOfToday, lt: startOfTomorrow },
      dueTodayReminderSentAt: null,
    },
  });

  for (const request of dueToday) {
    await prisma.$transaction(async (tx) => {
      await tx.aidRequest.update({
        where: { id: request.id },
        data: { dueTodayReminderSentAt: now },
      });

      await tx.notification.create({
        data: {
          userId: request.userId,
          aidRequestId: request.id,
          type: "reminder",
          message: `Ton remboursement de ${request.amount} FCFA arrive à échéance aujourd'hui.`,
        },
      });
    });
  }

  return { reminded: upcoming.length, remindedDueToday: dueToday.length };
}
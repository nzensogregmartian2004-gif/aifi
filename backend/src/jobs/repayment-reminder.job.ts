import { prisma } from "../db/client";

export async function sendRepaymentReminders() {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const now = new Date();
  const threshold = new Date(now.getTime() + settings.reminderDaysBefore * 24 * 60 * 60 * 1000);

  const upcoming = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED"] },
      dueDate: { lte: threshold, gt: now },
      reminderSentAt: null, // un seul rappel par demande
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

  return { reminded: upcoming.length };
}
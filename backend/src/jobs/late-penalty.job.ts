import { prisma } from "../db/client";
import { addPoints } from "../modules/points/points.service";
import { notifyUser } from "../modules/notifications/notification.service";

export async function applyLatePenalties() {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const now = new Date();

  const overdue = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED"] },
      dueDate: { lt: now },
      latePenaltyAppliedAt: null, // pénalité appliquée une seule fois par demande
    },
    include: { user: { select: { isPremium: true } } },
  });

  let penalized = 0;

  for (const request of overdue) {
    // Sursis AIFI+ : un membre premium n'est marqué en retard (et pénalisé)
    // qu'après ce délai supplémentaire passé l'échéance, pas au jour pile.
    if (request.user.isPremium) {
      const graceDeadline = new Date(request.dueDate!);
      graceDeadline.setDate(graceDeadline.getDate() + settings.premiumGraceDays);
      if (now < graceDeadline) continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.aidRequest.update({
        where: { id: request.id },
        data: { status: "LATE", latePenaltyAppliedAt: now },
      });
    });

    await addPoints(request.userId, -settings.latePenaltyPoints, "penalite_retard");

    // notifyUser (et non prisma.notification.create) : envoie aussi un vrai
    // push Expo, pour que le client voie l'alerte même app fermée.
    await notifyUser(
      request.userId,
      "late_penalty",
      `Pénalité de ${settings.latePenaltyPoints} points pour retard de remboursement. Si le paiement n'est pas régularisé sous 3 jours, ton compte sera automatiquement bloqué.`,
      request.id
    );
    penalized++;
  }

  return { penalized };
}
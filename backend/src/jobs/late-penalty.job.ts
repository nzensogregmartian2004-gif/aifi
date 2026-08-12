import { prisma } from "../db/client";
import { addPoints } from "../modules/points/points.service";

export async function applyLatePenalties() {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const now = new Date();

  const overdue = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED"] },
      dueDate: { lt: now },
      latePenaltyAppliedAt: null, // pénalité appliquée une seule fois par demande
    },
  });

  for (const request of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.aidRequest.update({
        where: { id: request.id },
        data: { status: "LATE", latePenaltyAppliedAt: now },
      });

      await addPoints(request.userId, -settings.latePenaltyPoints, "penalite_retard");

      await tx.notification.create({
        data: {
          userId: request.userId,
          aidRequestId: request.id,
          type: "late_penalty",
          message: `Pénalité de ${settings.latePenaltyPoints} points pour retard de remboursement.`,
        },
      });
    });
  }

  return { penalized: overdue.length };
}
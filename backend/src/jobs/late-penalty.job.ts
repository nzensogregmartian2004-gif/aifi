import { prisma } from "../db/client";
import { addPoints } from "../modules/points/points.service";
import { notifyUser } from "../modules/notifications/notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pénalités de retard par paliers. Pour chaque demande en retard, un palier
 * tombe à l'échéance, puis tous les `lateStepDays` jours. Chaque palier retire
 * `latePenaltyPoints` points de confiance (jamais en dessous de zéro).
 * Le nombre de paliers déjà appliqués est stocké sur la demande (latePenaltySteps),
 * donc rien n'est appliqué deux fois, même si le job a été coupé.
 * Le blocage au jour `lateBlockDays` est géré par account-block.job.ts.
 */
export async function applyLatePenalties() {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const now = new Date();
  const maxSteps = Math.ceil(settings.lateBlockDays / settings.lateStepDays);

  const open = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED", "LATE"] },
      dueDate: { lt: now },
    },
    include: { user: { select: { isPremium: true, status: true } } },
  });

  let penalized = 0;

  for (const request of open) {
    // Un compte déjà suspendu ne reçoit plus de pénalité : il sera régularisé par un admin.
    if (request.user.status !== "ACTIVE") continue;

    // Sursis AIFI+ : l'échéance est décalée de premiumGraceDays.
    const grace = request.user.isPremium ? settings.premiumGraceDays : 0;
    const due = request.dueDate!.getTime() + grace * DAY_MS;
    const daysLate = Math.floor((now.getTime() - due) / DAY_MS);
    if (daysLate < 0) continue;

    const stepsDue = Math.min(Math.floor(daysLate / settings.lateStepDays) + 1, maxSteps);
    if (stepsDue <= request.latePenaltySteps) continue;

    // Premier palier : la série de remboursements à temps repart à zéro.
    if (request.latePenaltySteps === 0) {
      await prisma.user.update({ where: { id: request.userId }, data: { onTimeStreak: 0 } });
    }

    for (let step = request.latePenaltySteps + 1; step <= stepsDue; step++) {
      await prisma.aidRequest.update({
        where: { id: request.id },
        data: {
          status: "LATE",
          latePenaltySteps: step,
          latePenaltyAppliedAt: request.latePenaltyAppliedAt ?? now,
        },
      });
      await addPoints(request.userId, -settings.latePenaltyPoints, `penalite_retard_palier_${step}`);
      penalized++;
    }

    const remainingDays = settings.lateBlockDays - daysLate;
    await notifyUser(
      request.userId,
      "late_penalty",
      `Retard de remboursement : palier ${stepsDue} atteint, -${settings.latePenaltyPoints} points de confiance. ` +
        (remainingDays > 0
          ? `Ton compte sera bloqué dans ${remainingDays} jour(s) si le remboursement n'est pas fait.`
          : `Ton compte est en cours de blocage.`),
      request.id
    );
  }

  return { penalized };
}

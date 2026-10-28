import { prisma } from "../db/client";
import { notifyUser } from "../modules/notifications/notification.service";
import { addPoints } from "../modules/points/points.service";
import { lateState, surchargeFor, dailyInterest, sameLocalDay, formatAmount, roundToFranc } from "../modules/finance/rules";

/**
 * Gestion automatique des retards, exécutée chaque jour à 6h (heure de Libreville) :
 *  - le jour de l'échéance : aucune action (le rappel existe déjà) ;
 *  - pendant le jour de grâce (1 jour clients simples, 3 jours AIFI+) : un message par jour,
 *    sans aucune pénalité ;
 *  - après le sursis, pour chaque jour de retard :
 *      · le montant dû augmente de l'intérêt journalier de la grille (calcul exact, total arrondi
 *        au franc le plus proche, recalculé à partir du montant de base : jamais cumulé) ;
 *      · la confiance baisse de latePenaltyPoints points, jusqu'à zéro ;
 *  - un jour de retard n'est jamais facturé deux fois (lateDaysCharged).
 * Il n'y a pas de blocage de compte.
 */
export async function applyLateSurcharges(now: Date = new Date()) {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const open = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED", "LATE"] },
      dueDate: { lt: now },
    },
    include: { user: { select: { status: true } } },
  });

  let surcharged = 0;
  let notified = 0;

  for (const request of open) {
    // Un compte suspendu par un admin ne reçoit rien automatiquement : l'admin tranche.
    if (request.user.status !== "ACTIVE" || !request.dueDate) continue;

    const state = lateState(request.dueDate, now, request.graceDays);
    if (state.phase === "ON_TIME") continue;

    if (state.phase === "GRACE") {
      if (sameLocalDay(request.lateNotifiedAt, now)) continue;
      const daily = dailyInterest(request.interestAmount, request.gridDurationDays);
      await notifyUser(
        request.userId,
        state.daysAfterDue === 1 ? "late_grace_start" : "late_grace_reminder",
        { days: state.graceDaysLeft, daily: formatAmount(daily) },
        request.id
      );
      await prisma.aidRequest.update({ where: { id: request.id }, data: { lateNotifiedAt: now } });
      notified++;
      continue;
    }

    // Phase LATE : seulement pour les jours de retard pas encore facturés.
    if (state.lateDays <= request.lateDaysCharged) continue;
    const newlyLate = state.lateDays - request.lateDaysCharged;

    const base = request.baseAmountDue ?? request.amountDue;
    const newAmountDue = roundToFranc(
      base + surchargeFor(request.interestAmount, request.gridDurationDays, state.lateDays)
    );
    const surcharge = newAmountDue - base;
    const firstLateDay = request.lateDaysCharged === 0;

    await prisma.aidRequest.update({
      where: { id: request.id },
      data: {
        status: "LATE",
        amountDue: newAmountDue,
        lateDaysCharged: state.lateDays,
        lateSurchargeAmount: surcharge,
        lateNotifiedAt: now,
      },
    });

    // Premier jour de retard : la série de remboursements à temps repart à zéro.
    if (firstLateDay) {
      await prisma.user.update({ where: { id: request.userId }, data: { onTimeStreak: 0 } });
    }

    // Pénalité de confiance : par jour de retard, jusqu'à épuisement des points (jamais en dessous de zéro).
    const before = await prisma.user.findUniqueOrThrow({ where: { id: request.userId }, select: { points: true } });
    let pointsLost = 0;
    const penalty = settings.latePenaltyPoints * newlyLate;
    if (penalty > 0 && before.points > 0) {
      const after = await addPoints(request.userId, -penalty, `penalite_retard_jour_${state.lateDays}`);
      pointsLost = before.points - after.points;
    }

    await notifyUser(
      request.userId,
      "late_surcharge",
      {
        total: formatAmount(newAmountDue),
        added: formatAmount(newAmountDue - request.amountDue),
        days: state.lateDays,
        points: pointsLost,
      },
      request.id
    );
    surcharged++;
  }

  return { surcharged, notified };
}

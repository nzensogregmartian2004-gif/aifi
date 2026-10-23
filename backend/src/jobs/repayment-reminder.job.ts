import { prisma } from "../db/client";
import { notifyUser } from "../modules/notifications/notification.service";

const SHORT_LOAN_DURATION_DAYS = 3;
const LONG_LOAN_REMINDER_WINDOW_DAYS = 3; // fenêtre des rappels quotidiens : J-2, J-1, J0 (jour de l'échéance)

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Cadence de rappel liée à la durée du prêt :
 *  - Prêts sur 3 jours (durationDays === 3) : UN SEUL rappel, à J-1.
 *  - Tous les autres prêts : un rappel CHAQUE JOUR pendant les 3 derniers
 *    jours avant l'échéance (J-2, J-1, J0 = jour de l'échéance inclus).
 *
 * `reminderSentAt` sert maintenant de "date du dernier rappel envoyé" (et non
 * plus juste un flag une-fois) — ça permet les rappels quotidiens répétés sur
 * les prêts longs, tout en empêchant un double envoi le même jour si le job
 * tournait deux fois dans la journée.
 *
 * `settings.reminderDaysBefore` n'est plus utilisé par ce job : la cadence
 * est désormais fixe et basée sur la durée du prêt plutôt que sur ce réglage
 * admin. Le champ reste dans les réglages (rien ne casse si on le modifie
 * encore), mais il n'a plus d'effet sur les rappels.
 */
export async function sendRepaymentReminders() {
  const now = new Date();
  const lookaheadLimit = new Date(now.getTime() + LONG_LOAN_REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.aidRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "DISBURSED"] },
      dueDate: { not: null, lte: lookaheadLimit }, // aucun prêt n'a besoin de rappel plus de 3 jours à l'avance
    },
    select: { id: true, userId: true, amount: true, dueDate: true, durationDays: true, reminderSentAt: true },
  });

  let reminded = 0;

  for (const request of candidates) {
    const daysLeft = daysBetween(now, request.dueDate!); // > 0 avant échéance, 0 le jour même
    const isShortLoan = request.durationDays === SHORT_LOAN_DURATION_DAYS;
    const alreadyRemindedToday = request.reminderSentAt !== null && daysBetween(request.reminderSentAt, now) < 1;

    const shouldRemindToday = isShortLoan
      ? daysLeft === 1 && request.reminderSentAt === null // un seul rappel, à J-1
      : daysLeft >= 0 && daysLeft < LONG_LOAN_REMINDER_WINDOW_DAYS && !alreadyRemindedToday;

    if (!shouldRemindToday) continue;

    const message =
      daysLeft === 0
        ? `Ton remboursement de ${request.amount} FCFA arrive à échéance aujourd'hui.`
        : `Ton remboursement de ${request.amount} FCFA arrive à échéance dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`;

    await prisma.aidRequest.update({ where: { id: request.id }, data: { reminderSentAt: now } });
    // notifyUser crée la notification en-app ET envoie le push Expo réel —
    // contrairement à un simple prisma.notification.create(), c'est ce qui
    // fait apparaître le rappel sur le téléphone même app fermée.
    await notifyUser(request.userId, daysLeft === 0 ? "reminder_today" : "reminder_days", { amount: request.amount, days: daysLeft }, request.id);

    reminded++;
    // placeholder : brancher ici un envoi SMS/email réel plus tard
  }

  return { reminded };
}
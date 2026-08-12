import { prisma } from "../db/client";
import { notifyUser, notifyAdmins } from "../modules/notifications/notification.service";
import { attemptStatusRecovery } from "../modules/payments/payment.service";

// MyPVit recommande d'attendre ~3 minutes avant de considérer une transaction
// PENDING comme "incertaine". On tente d'abord de la résoudre via Check Status
// (implémentation prudente, voir mypvit.client.ts) ; si ça ne suffit pas, on
// alerte le client et l'admin pour basculer sur le circuit manuel existant.
const STALE_AFTER_MS = 5 * 60 * 1000;

export async function flagStalePayments() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const stale = await prisma.paymentTransaction.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff }, staleNotifiedAt: null },
    include: { user: true },
  });

  let recovered = 0;
  const stillUncertain: typeof stale = [];

  for (const tx of stale) {
    const result = await attemptStatusRecovery(tx.id);
    if (result === "resolved") {
      recovered += 1;
    } else {
      stillUncertain.push(tx);
    }
  }

  for (const tx of stillUncertain) {
    await notifyUser(
      tx.userId,
      "payment_uncertain",
      "On n'a toujours pas reçu la confirmation de ton paiement Mobile Money. Si l'argent a été débité, déclare-le manuellement avec une capture d'écran pour qu'on vérifie."
    );
    await notifyAdmins(
      "payment_uncertain",
      `Paiement MyPVit incertain pour ${tx.user.name} (${tx.amount} FCFA, réf ${tx.reference}) — aucun callback reçu après 5 min.`
    );
    await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { staleNotifiedAt: new Date() },
    });
  }

  return { recovered, flagged: stillUncertain.length };
}

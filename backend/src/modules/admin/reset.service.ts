import { prisma } from "../../db/client";
import { purgeIdentityFiles } from "../users/identity-purge";

/**
 * Supprime les données transactionnelles et de test (demandes d'aide,
 * remboursements, déclarations, paiements, portefeuille, retraits, notifications,
 * messages) ainsi que les comptes clients.
 *
 * Conservés volontairement : les comptes ADMIN, la configuration (AppSettings,
 * paliers) et LE JOURNAL D'AUDIT, qui n'est jamais effacé par une réinitialisation.
 *
 * Tout est fait dans une seule transaction : soit tout part, soit rien ne bouge.
 */
export async function resetAllTestData() {
  // Pièces d'identité des clients supprimés d'abord (fichiers + fiches de vérification).
  const clients = await prisma.user.findMany({ where: { role: "CLIENT" }, select: { id: true } });
  for (const client of clients) {
    await purgeIdentityFiles(client.id);
  }

  const [
    messagesDeleted,
    repaymentsDeleted,
    declarationsDeleted,
    paymentsDeleted,
    aidRequestsDeleted,
    walletDeleted,
    withdrawalsDeleted,
    notificationsDeleted,
    clientsDeleted,
  ] = await prisma.$transaction([
    prisma.message.deleteMany({}),
    prisma.repayment.deleteMany({}),
    prisma.repaymentDeclaration.deleteMany({}),
    prisma.paymentTransaction.deleteMany({}),
    prisma.aidRequest.deleteMany({}),
    prisma.walletEntry.deleteMany({}),
    prisma.withdrawal.deleteMany({}),
    prisma.notification.deleteMany({}),
    prisma.user.deleteMany({ where: { role: "CLIENT" } }),
  ]);

  return {
    messagesDeleted: messagesDeleted.count,
    repaymentsDeleted: repaymentsDeleted.count,
    declarationsDeleted: declarationsDeleted.count,
    paymentsDeleted: paymentsDeleted.count,
    aidRequestsDeleted: aidRequestsDeleted.count,
    walletDeleted: walletDeleted.count,
    withdrawalsDeleted: withdrawalsDeleted.count,
    notificationsDeleted: notificationsDeleted.count,
    clientsDeleted: clientsDeleted.count,
  };
}

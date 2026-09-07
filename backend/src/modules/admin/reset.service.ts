import { prisma } from "../../db/client";

/**
 * Supprime TOUTES les données transactionnelles/de test (demandes d'aide,
 * remboursements, déclarations, transactions de paiement, portefeuille,
 * retraits, notifications, messages, journal d'audit) ainsi que TOUS les
 * comptes clients — pour repartir d'une base honnête au lancement de la
 * vraie production.
 *
 * Conservé volontairement : les comptes ADMIN, et la configuration métier
 * (AppSettings, DurationTier, CeilingTier) — ce ne sont pas des "valeurs qui
 * s'enregistrent" mais des réglages délibérément choisis par l'admin.
 *
 * Ordre de suppression = enfants avant parents (aucune cascade en base).
 * Le tout dans une seule transaction : soit tout part, soit rien ne bouge.
 */
export async function resetAllTestData() {
  const [
    messagesDeleted,
    repaymentsDeleted,
    declarationsDeleted,
    paymentsDeleted,
    aidRequestsDeleted,
    walletDeleted,
    withdrawalsDeleted,
    notificationsDeleted,
    auditLogsDeleted,
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
    prisma.auditLog.deleteMany({}),
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
    auditLogsDeleted: auditLogsDeleted.count,
    clientsDeleted: clientsDeleted.count,
  };
}

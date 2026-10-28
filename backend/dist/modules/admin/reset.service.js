"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetAllTestData = resetAllTestData;
const client_1 = require("../../db/client");
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
async function resetAllTestData() {
    const [messagesDeleted, repaymentsDeleted, declarationsDeleted, paymentsDeleted, aidRequestsDeleted, walletDeleted, withdrawalsDeleted, notificationsDeleted, clientsDeleted,] = await client_1.prisma.$transaction([
        client_1.prisma.message.deleteMany({}),
        client_1.prisma.repayment.deleteMany({}),
        client_1.prisma.repaymentDeclaration.deleteMany({}),
        client_1.prisma.paymentTransaction.deleteMany({}),
        client_1.prisma.aidRequest.deleteMany({}),
        client_1.prisma.walletEntry.deleteMany({}),
        client_1.prisma.withdrawal.deleteMany({}),
        client_1.prisma.notification.deleteMany({}),
        client_1.prisma.user.deleteMany({ where: { role: "CLIENT" } }),
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

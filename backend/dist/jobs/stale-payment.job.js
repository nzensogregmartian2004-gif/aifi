"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flagStalePayments = flagStalePayments;
const client_1 = require("../db/client");
const notification_service_1 = require("../modules/notifications/notification.service");
const payment_service_1 = require("../modules/payments/payment.service");
// MyPVit recommande d'attendre ~3 minutes avant de considérer une transaction
// PENDING comme "incertaine". On tente d'abord de la résoudre via Check Status
// (implémentation prudente, voir mypvit.client.ts) ; si ça ne suffit pas, on
// alerte le client et l'admin pour basculer sur le circuit manuel existant.
const STALE_AFTER_MS = 5 * 60 * 1000;
async function flagStalePayments() {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await client_1.prisma.paymentTransaction.findMany({
        where: { status: "PENDING", createdAt: { lt: cutoff }, staleNotifiedAt: null },
        include: { user: true },
    });
    let recovered = 0;
    const stillUncertain = [];
    for (const tx of stale) {
        const result = await (0, payment_service_1.attemptStatusRecovery)(tx.id);
        if (result === "resolved") {
            recovered += 1;
        }
        else {
            stillUncertain.push(tx);
        }
    }
    for (const tx of stillUncertain) {
        await (0, notification_service_1.notifyUser)(tx.userId, "payment_uncertain", {});
        await (0, notification_service_1.notifyAdmins)("admin_payment_uncertain", { name: tx.user.name, amount: tx.amount, reference: tx.reference });
        await client_1.prisma.paymentTransaction.update({
            where: { id: tx.id },
            data: { staleNotifiedAt: new Date() },
        });
    }
    return { recovered, flagged: stillUncertain.length };
}

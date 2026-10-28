"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creditWallet = creditWallet;
exports.getWalletBalance = getWalletBalance;
const client_1 = require("../../db/client");
async function creditWallet(userId, amount, reason) {
    return client_1.prisma.walletEntry.create({
        data: { userId, amount, reason },
    });
}
async function getWalletBalance(userId) {
    const entries = await client_1.prisma.walletEntry.findMany({ where: { userId } });
    return entries.reduce((sum, e) => sum + e.amount, 0);
}

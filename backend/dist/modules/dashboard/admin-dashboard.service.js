"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminDashboard = getAdminDashboard;
const client_1 = require("../../db/client");
async function getAdminDashboard() {
    const [totalUsers, pendingAccounts, pendingAidRequests, activeAidRequests, lateAidRequests, pendingWithdrawals, pendingRepaymentDeclarations, disbursedRequests, repayments, referralCommissions,] = await Promise.all([
        client_1.prisma.user.count(),
        client_1.prisma.user.count({ where: { status: "PENDING" } }),
        client_1.prisma.aidRequest.count({ where: { status: "PENDING" } }),
        client_1.prisma.aidRequest.count({ where: { status: { in: ["ACCEPTED", "DISBURSED"] } } }),
        client_1.prisma.aidRequest.count({ where: { status: "LATE" } }),
        client_1.prisma.withdrawal.count({ where: { status: "PENDING" } }),
        client_1.prisma.repaymentDeclaration.count({ where: { status: "PENDING" } }),
        client_1.prisma.aidRequest.findMany({ where: { status: { in: ["DISBURSED", "REPAID", "LATE"] } } }),
        client_1.prisma.repayment.findMany(),
        client_1.prisma.walletEntry.findMany({ where: { reason: "referral_commission" } }),
    ]);
    return {
        totalUsers,
        pendingAccounts,
        pendingAidRequests,
        activeAidRequests,
        lateAidRequests,
        pendingWithdrawals,
        pendingRepaymentDeclarations,
        totalFundsDistributed: disbursedRequests.reduce((sum, r) => sum + r.amount, 0),
        totalRepayments: repayments.reduce((sum, r) => sum + r.amount, 0),
        totalReferralCommissions: referralCommissions.reduce((sum, e) => sum + e.amount, 0),
    };
}

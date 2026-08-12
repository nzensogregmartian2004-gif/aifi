import { prisma } from "../../db/client";

export async function getAdminDashboard() {
  const [
    totalUsers,
    pendingAccounts,
    pendingAidRequests,
    activeAidRequests,
    lateAidRequests,
    pendingWithdrawals,
    pendingRepaymentDeclarations,
    disbursedRequests,
    repayments,
    referralCommissions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.aidRequest.count({ where: { status: "PENDING" } }),
    prisma.aidRequest.count({ where: { status: { in: ["ACCEPTED", "DISBURSED"] } } }),
    prisma.aidRequest.count({ where: { status: "LATE" } }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.repaymentDeclaration.count({ where: { status: "PENDING" } }),
    prisma.aidRequest.findMany({ where: { status: { in: ["DISBURSED", "REPAID", "LATE"] } } }),
    prisma.repayment.findMany(),
    prisma.walletEntry.findMany({ where: { reason: "referral_commission" } }),
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
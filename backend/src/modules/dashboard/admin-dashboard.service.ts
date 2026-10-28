import { prisma } from "../../db/client";

export async function getAdminDashboard(db: typeof prisma = prisma) {
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
    db.user.count({ where: { role: "CLIENT" } }),
    db.user.count({ where: { role: "CLIENT", status: "PENDING" } }),
    db.aidRequest.count({ where: { status: "PENDING" } }),
    db.aidRequest.count({ where: { status: { in: ["ACCEPTED", "DISBURSED", "LATE"] } } }),
    db.aidRequest.count({ where: { status: "LATE" } }),
    db.withdrawal.count({ where: { status: "PENDING" } }),
    db.repaymentDeclaration.count({ where: { status: "PENDING" } }),
    db.aidRequest.findMany({ where: { status: { in: ["DISBURSED", "REPAID", "LATE"] } } }),
    db.repayment.findMany(),
    db.walletEntry.findMany({ where: { reason: "referral_commission" } }),
  ]);

  // Encours : ce qui reste dû sur les prêts décaissés ou en retard (capital + intérêts − remboursé)
  const openLoans = await db.aidRequest.findMany({
    where: { status: { in: ["DISBURSED", "LATE"] } },
    include: { repayments: true },
  });

  return {
    totalUsers,
    pendingAccounts,
    pendingAidRequests,
    activeAidRequests,
    lateAidRequests,
    pendingWithdrawals,
    pendingRepaymentDeclarations,
    outstandingAmount: openLoans.reduce(
      (s: number, ar: any) => s + ar.amountDue - ar.repayments.reduce((x: number, r: any) => x + r.amount, 0),
      0
    ),
    totalFundsDistributed: disbursedRequests.reduce((sum, r) => sum + r.amount, 0),
    totalRepayments: repayments.reduce((sum, r) => sum + r.amount, 0),
    totalReferralCommissions: referralCommissions.reduce((sum, e) => sum + e.amount, 0),
  };
}
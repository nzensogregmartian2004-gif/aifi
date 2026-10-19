import { prisma } from "../../db/client";
import { getAvailableCeiling } from "../aid-requests/aid-request.service";
import { getWalletBalance } from "../wallet/wallet.service";

const TRUST_LEVELS = [
  { minPoints: 240, label: "Excellent" },
  { minPoints: 150, label: "Très fiable" },
  { minPoints: 100, label: "Fiable" },
  { minPoints: 50,  label: "Bon" },
  { minPoints: 20,  label: "Correct" },
  { minPoints: 10,  label: "Débutant" },
  { minPoints: 0,   label: "Nouveau" },
] as const;

function getTrustLevel(points: number): string {
  return TRUST_LEVELS.find(t => points >= t.minPoints)?.label ?? "Nouveau";
}

export async function getClientDashboard(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const activeRequests = await prisma.aidRequest.findMany({
    where: { userId, status: { in: ["ACCEPTED", "DISBURSED", "LATE"] } },
    orderBy: { dueDate: "asc" },
  });

  const nextDueDate = activeRequests.find(r => r.dueDate)?.dueDate ?? null;

  const referralsCount = await prisma.user.count({ where: { referredById: userId } });
  const aidRequestsCount = await prisma.aidRequest.count({ where: { userId } });
  const walletBalance = await getWalletBalance(userId);
  const ceilingAvailable = await getAvailableCeiling(userId);

  // Avantage AIFI+ : +20 sur le niveau de confiance affiché. Ça ne touche
  // que l'affichage (et donc le libellé de palier) — les points réels
  // stockés, eux, restent inchangés et continuent de piloter le plafond
  // normalement (le plafond profite déjà de son propre bonus premium).
  const displayedPoints = user.isPremium ? user.points + 20 : user.points;

  return {
    name: user.name,
    referralCode: user.referralCode,
    trustLevel: getTrustLevel(displayedPoints),
    points: displayedPoints,
    isPremium: user.isPremium,
    premiumExpiresAt: user.premiumExpiresAt,
    ceilingAllowed: user.ceiling,
    ceilingUsed: user.ceiling - ceilingAvailable,
    realPoints: user.points,
    ceilingAvailable,
    aidRequestsCount,
    nextDueDate,
    referralsCount,
    walletBalance,
  };
}
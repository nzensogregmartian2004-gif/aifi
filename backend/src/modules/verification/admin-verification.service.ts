import { AppError } from "../../errors";
import { prisma } from "../../db/client";
import { logAction } from "../audit/audit.service";
import { notifyUser } from "../notifications/notification.service";
import { validateAccount } from "../users/account-validation.service";

const USER_FIELDS = { id: true, name: true, phone: true, status: true, createdAt: true } as const;

export async function listVerifications(status?: string) {
  return prisma.identityVerification.findMany({
    where: status ? { status } : {},
    include: { user: { select: USER_FIELDS } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getVerificationDetail(userId: string) {
  return prisma.identityVerification.findUniqueOrThrow({
    where: { userId },
    include: { user: { select: USER_FIELDS } },
  });
}

/**
 * Valide ou refuse un dossier d'identité.
 * - Validation : le dossier passe APPROVED ; si le compte est encore en attente, il est activé.
 * - Refus : motif obligatoire, visible par le client, qui peut renvoyer ses documents.
 */
export async function decideVerification(
  adminId: string,
  userId: string,
  decision: "APPROVE" | "REJECT",
  note?: string
) {
  const current = await prisma.identityVerification.findUniqueOrThrow({ where: { userId } });
  if (current.status === "APPROVED") {
    throw new AppError("ALREADY_VERIFIED", "Ce dossier est déjà validé.");
  }

  const trimmed = note?.trim() || "";
  if (decision === "REJECT" && !trimmed) {
    throw new AppError("REASON_REQUIRED", "Indique le motif du refus : le client le verra.");
  }

  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const updated = await prisma.identityVerification.update({
    where: { userId },
    data: {
      status,
      reviewNote: decision === "REJECT" ? trimmed : null,
      reviewedAt: new Date(),
    },
  });

  await logAction({
    adminId,
    action: decision === "APPROVE" ? "verification_approve" : "verification_reject",
    entityType: "IdentityVerification",
    entityId: updated.id,
    before: { status: current.status },
    after: { status },
    note: trimmed || undefined,
  });

  if (decision === "APPROVE") {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status === "PENDING") {
      await validateAccount(userId, adminId);
    }
    await notifyUser(userId, "verification_approved", {});
  } else {
    await notifyUser(
      userId,
      "verification_rejected",
      { reason: trimmed }
    );
  }

  return updated;
}

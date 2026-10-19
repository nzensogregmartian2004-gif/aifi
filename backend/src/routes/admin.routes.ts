import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import { recordRepayment, confirmRepaymentDeclaration, rejectRepaymentDeclaration } from "../modules/repayments/repayment.service";
import { addPoints, recomputeCeilingForUser } from "../modules/points/points.service";
import { creditWallet } from "../modules/wallet/wallet.service";
import { approveWithdrawal, approveWithdrawalViaMypvit, rejectWithdrawal } from "../modules/wallet/withdrawal.service";
import { getAdminDashboard } from "../modules/dashboard/admin-dashboard.service";
import { acceptAidRequest, rejectAidRequest, disburseAidRequest, disburseAidRequestViaMypvit } from "../modules/aid-requests/aid-request.service";
import { suspendUser, reactivateUser, updateUserInfo, anonymizeUser } from "../modules/users/admin-user.service";
import { register, adminResetPassword } from "../modules/users/auth.controller";
import { notifyUser } from "../modules/notifications/notification.service";
import { logAction, listAuditLogs } from "../modules/audit/audit.service";
import { sendAdminMessage, getThread, markThreadRead, listConversationsForAdmin } from "../modules/messages/message.service";
import settingsRouter from "./admin.settings.routes";
import { getAnalytics } from "../modules/analytics/analytics.service";
import { resetAllTestData } from "../modules/admin/reset.service";
import { prisma } from "../db/client";
import { getOperators } from "../modules/payments/mypvit.client";
import { env, isMypvitConfigured, OperatorCode } from "../config/env";

const VALID_OPERATORS: OperatorCode[] = ["AIRTEL_MONEY", "MOOV_MONEY", "VISA_MASTERCARD"];
function parseOperatorParam(value: unknown): OperatorCode {
  if (typeof value === "string" && (VALID_OPERATORS as string[]).includes(value)) return value as OperatorCode;
  return "AIRTEL_MONEY";
}
import { validateBody } from "../middleware/validate";
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminResetPasswordSchema,
  recordRepaymentSchema,
  confirmDeclarationSchema,
  rejectDeclarationSchema,
  approveWithdrawalSchema,
  sendMessageSchema,
} from "../validation/schemas";

const router = Router();

router.use(requireAuth, requireAdmin);

router.use("/settings", settingsRouter);

router.get("/admins", async (_req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, phone: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(admins);
});

router.post("/admins", validateBody(adminCreateUserSchema), async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    const user = await register(name, phone, password);
    const admin = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN", status: "ACTIVE" },
    });
    res.json({ id: admin.id, name: admin.name, phone: admin.phone });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/dashboard", async (_req, res) => {
  const data = await getAdminDashboard();
  res.json(data);
});

router.get("/users", async (req, res) => {
  try {
    const { status, q } = req.query as { status?: string; q?: string };
    // Cette liste sert à gérer les CLIENTS. Les comptes ADMIN ont leur propre
    // écran ("Gérer les administrateurs") — on ne veut pas qu'un admin
    // apparaisse ici et puisse être suspendu par erreur comme un client.
    const where: any = { role: "CLIENT" };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { referralCode: { contains: q, mode: "insensitive" } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: (req.params.id as string) },
      include: {
        aidRequests: { include: { repayments: true }, orderBy: { createdAt: "desc" } },
        repaymentDeclarations: { orderBy: { createdAt: "desc" } },
        withdrawals: { orderBy: { createdAt: "desc" } },
        walletEntries: { orderBy: { createdAt: "desc" } },
        referrals: { select: { id: true, name: true, status: true, createdAt: true } },
        referredBy: { select: { id: true, name: true } },
      },
    });
    res.json(user);
  } catch (err: any) {
    res.status(404).json({ error: "Utilisateur introuvable" });
  }
});

router.post("/users/:id/premium", async (req, res) => {
  try {
    const { isPremium } = req.body as { isPremium: boolean };
    const before = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id as string } });
    // Activation/désactivation manuelle par un admin : accès à vie, pas de
    // date d'expiration (contrairement à un abonnement payé par le client).
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: {
        isPremium: !!isPremium,
        premiumSince: isPremium ? before.premiumSince ?? new Date() : before.premiumSince,
        premiumExpiresAt: isPremium ? null : null,
      },
    });

    await recomputeCeilingForUser(user.id);

    await logAction({
      adminId: req.auth!.userId,
      action: isPremium ? "user_premium_activate" : "user_premium_deactivate",
      entityType: "User",
      entityId: user.id,
      before: { isPremium: before.isPremium },
      after: { isPremium: user.isPremium },
    });

    await notifyUser(
      user.id,
      isPremium ? "premium_activated" : "premium_deactivated",
      isPremium
        ? "Ton compte est passé AIFI+ ! Profite des commissions de parrainage, du plafond majoré et des frais réduits."
        : "Ton abonnement AIFI+ a été désactivé."
    );

    res.json({ id: user.id, isPremium: user.isPremium, premiumSince: user.premiumSince, premiumExpiresAt: user.premiumExpiresAt });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/users/:id/validate", async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: (req.params.id as string) },
      data: { status: "ACTIVE" },
    });

    await logAction({
      adminId: req.auth!.userId,
      action: "user_validate",
      entityType: "User",
      entityId: user.id,
      before: { status: "PENDING" },
      after: { status: "ACTIVE" },
    });

    await addPoints(user.id, 10, "validation_compte");

    if (user.referredById) {
      const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      await creditWallet(user.referredById, settings.referralBonus, "referral_bonus");
      await addPoints(user.referredById, settings.referralPoints, "parrainage_valide");
      await notifyUser(
        user.referredById,
        "referral_validated",
        `${user.name}, que vous avez parrainé, a été validé. Vous recevez ${settings.referralBonus} FCFA et ${settings.referralPoints} points.`
      );
    }

    await notifyUser(user.id, "account_validated", "Votre compte a été validé. Vous pouvez maintenant l'utiliser.");

    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/users/:id/suspend", async (req, res) => {
  try {
    if (req.params.id === req.auth!.userId) {
      return res.status(400).json({ error: "Tu ne peux pas suspendre ton propre compte." });
    }
    const user = await suspendUser((req.params.id as string), req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/users/:id/reactivate", async (req, res) => {
  try {
    const user = await reactivateUser((req.params.id as string), req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/users/:id", validateBody(adminUpdateUserSchema), async (req, res) => {
  try {
    const { name, phone, points, ceiling } = req.body;
    const user = await updateUserInfo((req.params.id as string), { name, phone, points, ceiling }, req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/users/:id/reset-password", validateBody(adminResetPasswordSchema), async (req, res) => {
  try {
    const { newPassword } = req.body;
    const result = await adminResetPassword((req.params.id as string), newPassword);
    await logAction({
      adminId: req.auth!.userId,
      action: "user_reset_password",
      entityType: "User",
      entityId: (req.params.id as string),
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/users/:id/anonymize", async (req, res) => {
  try {
    const user = await anonymizeUser((req.params.id as string), req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/aid-requests", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const where: any = {};
    if (status) where.status = status;
    const requests = await prisma.aidRequest.findMany({
      where,
      include: { user: { select: { id: true, name: true, phone: true, isPremium: true } }, repayments: true },
      orderBy: { createdAt: "asc" },
    });
    // Priorité AIFI+ : leurs demandes remontent toujours en tête de liste.
    // Prisma ne trie pas sur un champ de relation directement, donc ce tri
    // se fait après coup (le tri par ancienneté ci-dessus reste la règle au
    // sein de chaque groupe, premium comme non-premium).
    requests.sort((a: any, b: any) => (a.user.isPremium === b.user.isPremium ? 0 : a.user.isPremium ? -1 : 1));
    res.json(requests);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/aid-requests/:id/accept", async (req, res) => {
  try {
    const result = await acceptAidRequest((req.params.id as string), req.auth!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/aid-requests/:id/reject", async (req, res) => {
  try {
    const result = await rejectAidRequest((req.params.id as string), req.auth!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/aid-requests/:id/disburse", async (req, res) => {
  try {
    const { note } = req.body as { note?: string };
    const result = await disburseAidRequest((req.params.id as string), req.auth!.userId, note);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/payments/config", async (_req, res) => {
  res.json({ available: isMypvitConfigured() });
});

router.post("/aid-requests/:id/disburse-mypvit", async (req, res) => {
  try {
    const result = await disburseAidRequestViaMypvit((req.params.id as string), req.auth!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/aid-requests/:id/repayments", validateBody(recordRepaymentSchema), async (req, res) => {
  try {
    const { amount, proofImageUrl } = req.body;
    if (!proofImageUrl) {
      throw new Error("Un justificatif (image) est requis pour enregistrer un dépôt");
    }
    const result = await recordRepayment((req.params.id as string), amount, req.auth!.userId, proofImageUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Recherche un utilisateur par numéro de téléphone avec ses aides en cours de
// remboursement — sert d'écran "dépôt facilité" : l'admin saisit le numéro,
// choisit l'aide concernée, entre le montant et joint son justificatif.
router.get("/users/lookup-by-phone", async (req, res) => {
  try {
    const { phone } = req.query as { phone?: string };
    if (!phone) throw new Error("Numéro de téléphone requis");
    const user = await prisma.user.findFirst({
      where: { phone: { contains: phone } },
      include: {
        aidRequests: {
          where: { status: { in: ["ACCEPTED", "DISBURSED", "LATE"] } },
          include: { repayments: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!user) return res.status(404).json({ error: "Aucun utilisateur trouvé avec ce numéro" });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/repayment-declarations", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const where: any = {};
    if (status) where.status = status;
    const declarations = await prisma.repaymentDeclaration.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        aidRequest: { select: { id: true, amount: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(declarations);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/repayment-declarations/:id/confirm", validateBody(confirmDeclarationSchema), async (req, res) => {
  try {
    const { proofImageUrl } = req.body;
    const result = await confirmRepaymentDeclaration((req.params.id as string), req.auth!.userId, proofImageUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/repayment-declarations/:id/reject", validateBody(rejectDeclarationSchema), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await rejectRepaymentDeclaration((req.params.id as string), req.auth!.userId, reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/withdrawals", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const where: any = {};
    if (status) where.status = status;
    const withdrawals = await prisma.withdrawal.findMany({
      where,
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(withdrawals);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/withdrawals/:id/approve", validateBody(approveWithdrawalSchema), async (req, res) => {
  try {
    const { proofImageUrl } = req.body;
    const withdrawal = await approveWithdrawal((req.params.id as string), req.auth!.userId, proofImageUrl);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/withdrawals/:id/approve-mypvit", async (req, res) => {
  try {
    const withdrawal = await approveWithdrawalViaMypvit((req.params.id as string), req.auth!.userId);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/withdrawals/:id/reject", async (req, res) => {
  try {
    const withdrawal = await rejectWithdrawal((req.params.id as string), req.auth!.userId);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Outils de diagnostic MyPVit — utiles pour confirmer le bon fonctionnement
// des endpoints dont le format n'est pas publiquement documenté (voir notes
// dans mypvit.client.ts) avant de s'appuyer dessus en production.
// ?operator=AIRTEL_MONEY|MOOV_MONEY|VISA_MASTERCARD (défaut AIRTEL_MONEY) — précise
// quel compte marchand utiliser, puisque chacun a son propre operationAccountCode.
router.get("/payments/mypvit/operators", async (req, res) => {
  const operator = parseOperatorParam(req.query.operator);
  const operators = await getOperators(operator);
  res.json({ operator, operators, note: "Liste vide = appel indisponible ou format de réponse inattendu." });
});

router.get("/audit-logs", async (req, res) => {
  try {
    const { entityType, entityId, adminId } = req.query as {
      entityType?: string;
      entityId?: string;
      adminId?: string;
    };
    const logs = await listAuditLogs({ entityType, entityId, adminId });
    res.json(logs);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/conversations", async (_req, res) => {
  try {
    const conversations = await listConversationsForAdmin();
    res.json(conversations);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/conversations/:clientId/messages", async (req, res) => {
  try {
    const messages = await getThread((req.params.clientId as string));
    await markThreadRead((req.params.clientId as string), "ADMIN");
    res.json(messages);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/conversations/:clientId/messages", validateBody(sendMessageSchema), async (req, res) => {
  try {
    const { text, imageUrl } = req.body;
    const message = await sendAdminMessage((req.params.clientId as string), req.auth!.userId, text, imageUrl);
    res.json(message);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/analytics", async (_req, res) => {
  try {
    const analytics = await getAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Remise à zéro complète des données de test avant le vrai lancement en
// production — irréversible, protégée par une phrase de confirmation exacte
// envoyée par le client (en plus de la confirmation déjà faite côté écran).
router.post("/reset-data", async (req, res) => {
  if (!env.allowDataReset) {
    return res.status(403).json({ error: "La réinitialisation des données est désactivée sur ce serveur." });
  }
  try {
    if (req.body?.confirmation !== "REINITIALISER") {
      return res.status(400).json({ error: "Confirmation manquante ou incorrecte." });
    }
    const result = await resetAllTestData();
    // Journalisé APRÈS la suppression (le journal d'audit lui-même vient
    // d'être vidé par resetAllTestData) : c'est volontairement la seule
    // trace qui survit à une remise à zéro.
    await logAction({
      adminId: req.auth!.userId,
      action: "full_data_reset",
      entityType: "System",
      after: result,
      note: "Toutes les données transactionnelles et tous les comptes clients ont été supprimés.",
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
import { errorBody } from "../errors";
import { AppError } from "../errors";
import { listVerifications, getVerificationDetail, decideVerification } from "../modules/verification/admin-verification.service";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import { recordRepayment, confirmRepaymentDeclaration, rejectRepaymentDeclaration } from "../modules/repayments/repayment.service";
import { addPoints, recomputeCeilingForUser } from "../modules/points/points.service";
import { getUserRisk, getRiskOverview } from "../modules/risk/risk.service";
import { listEntries, addManualEntry, removeEntry } from "../modules/blacklist/blacklist.service";
import { creditWallet } from "../modules/wallet/wallet.service";
import { approveWithdrawal, approveWithdrawalViaMypvit, rejectWithdrawal } from "../modules/wallet/withdrawal.service";
import { getAdminDashboard } from "../modules/dashboard/admin-dashboard.service";
import { acceptAidRequest, rejectAidRequest, disburseAidRequest, disburseAidRequestViaMypvit } from "../modules/aid-requests/aid-request.service";
import { suspendUser, reactivateUser, updateUserInfo, anonymizeUser } from "../modules/users/admin-user.service";
import { adminResetPassword } from "../modules/users/auth.controller";
import { createAdmin, listAdmins, listAdminAudit, setSuperAdmin, setAdminStatus, resetAdminPassword } from "../modules/admins/admin-team.service";
import { adminSuperSchema, adminStatusSchema, confirmPaymentSchema, rejectPaymentSchema } from "../validation/schemas";
import { confirmPaymentManually, rejectPaymentManually } from "../modules/payments/payment.service";
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

router.get("/payments/pending", async (_req, res) => {
  const items = await prisma.paymentTransaction.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(items);
});

router.post("/payments/:id/confirm", validateBody(confirmPaymentSchema), async (req, res) => {
  try {
    res.json(await confirmPaymentManually(req.params.id as string, req.auth!.userId, req.body.providerReference));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/payments/:id/reject", validateBody(rejectPaymentSchema), async (req, res) => {
  try {
    res.json(await rejectPaymentManually(req.params.id as string, req.auth!.userId, req.body.reason));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/admins", async (_req, res) => {
  res.json(await listAdmins());
});

// Création directe d'un administrateur (rôle ADMIN, compte actif) : pas de parcours client, pas de message de bienvenue
router.post("/admins", requireSuperAdmin, validateBody(adminCreateUserSchema), async (req, res) => {
  try {
    const admin = await createAdmin(req.auth!.userId, req.body);
    res.json(admin);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/admins/audit", requireSuperAdmin, async (_req, res) => {
  res.json(await listAdminAudit());
});

router.patch("/admins/:id/super", requireSuperAdmin, validateBody(adminSuperSchema), async (req, res) => {
  try {
    const admin = await setSuperAdmin(req.auth!.userId, req.params.id as string, req.body.isSuperAdmin);
    res.json(admin);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.patch("/admins/:id/status", requireSuperAdmin, validateBody(adminStatusSchema), async (req, res) => {
  try {
    const admin = await setAdminStatus(req.auth!.userId, req.params.id as string, req.body.status);
    res.json(admin);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/admins/:id/reset-password", requireSuperAdmin, validateBody(adminResetPasswordSchema), async (req, res) => {
  try {
    res.json(await resetAdminPassword(req.auth!.userId, req.params.id as string, req.body.newPassword));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
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

// Bonus de points de confiance décidé par un admin (bon remboursement, fidélité, fêtes…).
// Le client reçoit une notification avec le message de l'admin et les points ajoutés.
router.post("/users/:id/bonus", requireSuperAdmin, async (req, res) => {
  try {
    const { points, message } = req.body as { points?: number; message?: string };
    const delta = Number(points);
    const text = (message || "").trim();
    if (!Number.isInteger(delta) || delta < 1 || delta > 100) {
      return res.status(400).json({ error: "Le bonus doit être un nombre entier entre 1 et 100 points." });
    }
    if (text.length < 3 || text.length > 280) {
      return res.status(400).json({ error: "Écris un message de 3 à 280 caractères pour le client." });
    }
    const userId = req.params.id as string;
    const result = await addPoints(userId, delta, "bonus_admin");

    await logAction({
      adminId: req.auth!.userId,
      action: "points_bonus",
      entityType: "User",
      entityId: userId,
      after: { bonus: delta, points: result.points },
      note: text,
    });

    await notifyUser(userId, "trust_bonus", { text, delta });
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Normalisation des numéros pour retrouver un client saisi sous différentes formes.
function canonicalPhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("+241")) p = "0" + p.slice(4);
  else if (/^241\d{8}$/.test(p)) p = "0" + p.slice(3);
  return p;
}

function phoneVariants(raw: string): string[] {
  const canonical = canonicalPhone(raw);
  const set = new Set([raw.replace(/[^\d+]/g, ""), canonical]);
  if (canonical.startsWith("0")) {
    const local = canonical.slice(1);
    set.add(`+241${local}`);
    set.add(`00241${local}`);
    set.add(`241${local}`);
  }
  return [...set];
}

// Cadeaux : points de confiance ou crédit portefeuille, à un client ou à tous les clients actifs.
router.post("/gifts", requireSuperAdmin, async (req, res) => {
  try {
    const { target, phone, type, amount, message } = req.body as {
      target?: string;
      phone?: string;
      type?: string;
      amount?: number;
      message?: string;
    };
    const text = (message || "").trim();
    const value = Number(amount);

    if (text.length < 3 || text.length > 280) {
      return res.status(400).json({ error: "Écris un message de 3 à 280 caractères pour le client." });
    }
    if (type === "POINTS" && (!Number.isInteger(value) || value < 1 || value > 100)) {
      return res.status(400).json({ error: "Les points doivent être un nombre entier entre 1 et 100." });
    }
    if (type === "WALLET" && (!Number.isInteger(value) || value < 100 || value > 50000)) {
      return res.status(400).json({ error: "Le crédit doit être entre 100 et 50 000 FCFA." });
    }
    if (type !== "POINTS" && type !== "WALLET") {
      return res.status(400).json({ error: "Type de cadeau invalide." });
    }

    let recipientIds: string[];
    let targetUserId: string | null = null;
    if (target === "ALL") {
      const actives = await prisma.user.findMany({
        where: { role: "CLIENT", status: "ACTIVE" },
        select: { id: true },
      });
      recipientIds = actives.map((u) => u.id);
    } else if (target === "USER") {
      const user = await prisma.user.findFirst({
        where: { role: "CLIENT", phone: { in: phoneVariants(String(phone || "")) } },
        select: { id: true },
      });
      if (!user) {
        return res.status(400).json({ error: "Aucun client ne correspond à ce numéro." });
      }
      recipientIds = [user.id];
      targetUserId = user.id;
    } else {
      return res.status(400).json({ error: "Destinataire invalide." });
    }

    if (recipientIds.length === 0) {
      return res.status(400).json({ error: "Aucun client actif à récompenser." });
    }

    const reward =
      type === "POINTS"
        ? `Tu reçois ${value} points de niveau de confiance.`
        : `${value} FCFA ont été crédités sur ton portefeuille AIFI.`;

    let delivered = 0;
    for (const id of recipientIds) {
      try {
        if (type === "POINTS") await addPoints(id, value, "cadeau_admin");
        else await creditWallet(id, value, "cadeau_admin");
        await notifyUser(id, "gift", { text, reward });
        delivered++;
      } catch (err) {
        console.error(`[gifts] échec pour le client ${id} :`, err);
      }
    }

    const gift = await prisma.gift.create({
      data: {
        adminId: req.auth!.userId,
        target,
        userId: targetUserId,
        type,
        amount: value,
        message: text,
        recipients: delivered,
      },
    });

    await logAction({
      adminId: req.auth!.userId,
      action: "gift_sent",
      entityType: "Gift",
      entityId: gift.id,
      after: { target, type, amount: value, recipients: delivered },
      note: text,
    });

    res.json({ recipients: delivered, giftId: gift.id });
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/gifts", requireSuperAdmin, async (_req, res) => {
  try {
    res.json(await prisma.gift.findMany({ orderBy: { createdAt: "desc" }, take: 50 }));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Vue globale du risque (répartition, tranches de retard, plus gros dossiers).
router.get("/risk-overview", async (_req, res) => {
  try {
    res.json(await getRiskOverview());
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Liste noire : consultation, ajout manuel, retrait (journalisé).
router.get("/blacklist", async (_req, res) => {
  try {
    res.json(await listEntries());
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/blacklist", async (req, res) => {
  try {
    const { phone, reason } = req.body as { phone?: string; reason?: string };
    const text = (reason || "").trim();
    if (!phone || phone.replace(/\D/g, "").length < 6) {
      return res.status(400).json({ error: "Saisis un numéro de téléphone valide." });
    }
    if (text.length < 3) {
      return res.status(400).json({ error: "Indique le motif de l'ajout." });
    }
    const entry = await addManualEntry(phone, text);
    await logAction({
      adminId: req.auth!.userId,
      action: "blacklist_add",
      entityType: "BlacklistEntry",
      entityId: entry.id,
      after: { phone: entry.phone },
      note: text,
    });
    res.json(entry);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/blacklist/:id/remove", async (req, res) => {
  try {
    const text = ((req.body as { reason?: string }).reason || "").trim();
    if (text.length < 3) {
      return res.status(400).json({ error: "Indique le motif du retrait." });
    }
    const entry = await removeEntry(req.params.id as string, text);
    await logAction({
      adminId: req.auth!.userId,
      action: "blacklist_remove",
      entityType: "BlacklistEntry",
      entityId: entry.id,
      note: text,
    });
    res.json(entry);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Situation de risque d'un client (paliers de retard, points, date de blocage).
router.get("/users/:id/risk", async (req, res) => {
  try {
    res.json(await getUserRisk(req.params.id as string));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/users/:id/premium", async (req, res) => {
  try {
    const { isPremium, durationDays } = req.body as { isPremium: boolean; durationDays?: number };
    const before = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id as string } });
    const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    // Activation manuelle par un admin : même durée qu'un abonnement trimestriel
    // (il n'existe plus d'accès à vie). Prolonge depuis l'échéance en cours.
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: {
        isPremium: !!isPremium,
        premiumSince: isPremium ? before.premiumSince ?? new Date() : before.premiumSince,
        premiumExpiresAt: isPremium
          ? new Date(Math.max(Date.now(), before.premiumExpiresAt?.getTime() ?? 0) + (durationDays && [30, 90, 180, 365].includes(durationDays) ? durationDays : settings.premiumDurationDays) * 86400000)
          : null,
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
      isPremium ? "premium_granted" : "premium_deactivated",
      {}
    );

    res.json({ id: user.id, isPremium: user.isPremium, premiumSince: user.premiumSince, premiumExpiresAt: user.premiumExpiresAt });
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
        { name: user.name, bonus: settings.referralBonus, points: settings.referralPoints }
      );
    }

    await notifyUser(user.id, "account_validated", {});

    res.json(user);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.post("/users/:id/reactivate", async (req, res) => {
  try {
    const user = await reactivateUser((req.params.id as string), req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.patch("/users/:id", validateBody(adminUpdateUserSchema), async (req, res) => {
  try {
    const { name, phone, points, ceiling } = req.body;
    // Points, plafond et numéro : réservés au super administrateur (le nom reste modifiable par tout admin)
    if ((phone !== undefined || points !== undefined || ceiling !== undefined) && !req.auth!.isSuperAdmin) {
      return res.status(403).json({ error: "Action réservée au super-administrateur", code: "SUPER_ADMIN_ONLY" });
    }
    const user = await updateUserInfo((req.params.id as string), { name, phone, points, ceiling }, req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.post("/users/:id/anonymize", async (req, res) => {
  try {
    const user = await anonymizeUser((req.params.id as string), req.auth!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.post("/aid-requests/:id/accept", async (req, res) => {
  try {
    const result = await acceptAidRequest((req.params.id as string), req.auth!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/aid-requests/:id/reject", async (req, res) => {
  try {
    const result = await rejectAidRequest((req.params.id as string), req.auth!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/aid-requests/:id/disburse", async (req, res) => {
  try {
    const { note } = req.body as { note?: string };
    const result = await disburseAidRequest((req.params.id as string), req.auth!.userId, note);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.post("/aid-requests/:id/repayments", validateBody(recordRepaymentSchema), async (req, res) => {
  try {
    const { amount, proofImageUrl } = req.body;
    if (!proofImageUrl) {
      throw new AppError("PROOF_REQUIRED", "Un justificatif (image) est requis pour enregistrer un dépôt");
    }
    const result = await recordRepayment((req.params.id as string), amount, req.auth!.userId, proofImageUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Recherche un utilisateur par numéro de téléphone avec ses aides en cours de
// remboursement — sert d'écran "dépôt facilité" : l'admin saisit le numéro,
// choisit l'aide concernée, entre le montant et joint son justificatif.
router.get("/users/lookup-by-phone", async (req, res) => {
  try {
    const { phone } = req.query as { phone?: string };
    if (!phone) throw new AppError("PHONE_REQUIRED", "Numéro de téléphone requis");
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
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.post("/repayment-declarations/:id/confirm", validateBody(confirmDeclarationSchema), async (req, res) => {
  try {
    const { proofImageUrl } = req.body;
    const result = await confirmRepaymentDeclaration((req.params.id as string), req.auth!.userId, proofImageUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/repayment-declarations/:id/reject", validateBody(rejectDeclarationSchema), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await rejectRepaymentDeclaration((req.params.id as string), req.auth!.userId, reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.post("/withdrawals/:id/approve", validateBody(approveWithdrawalSchema), async (req, res) => {
  try {
    const { proofImageUrl } = req.body;
    const withdrawal = await approveWithdrawal((req.params.id as string), req.auth!.userId, proofImageUrl);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/withdrawals/:id/approve-mypvit", async (req, res) => {
  try {
    const withdrawal = await approveWithdrawalViaMypvit((req.params.id as string), req.auth!.userId);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/withdrawals/:id/reject", async (req, res) => {
  try {
    const withdrawal = await rejectWithdrawal((req.params.id as string), req.auth!.userId);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
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
    res.status(400).json(errorBody(err));
  }
});

router.get("/conversations", async (_req, res) => {
  try {
    const conversations = await listConversationsForAdmin();
    res.json(conversations);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/conversations/:clientId/messages", async (req, res) => {
  try {
    const messages = await getThread((req.params.clientId as string));
    await markThreadRead((req.params.clientId as string), "ADMIN");
    res.json(messages);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/conversations/:clientId/messages", validateBody(sendMessageSchema), async (req, res) => {
  try {
    const { text, imageUrl } = req.body;
    const message = await sendAdminMessage((req.params.clientId as string), req.auth!.userId, text, imageUrl);
    res.json(message);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/analytics", async (_req, res) => {
  try {
    const analytics = await getAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Remise à zéro complète des données de test avant le vrai lancement en
// production — irréversible, protégée par une phrase de confirmation exacte
// envoyée par le client (en plus de la confirmation déjà faite côté écran).
router.post("/reset-data", requireSuperAdmin, async (req, res) => {
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
    res.status(400).json(errorBody(err));
  }
});

// Vérifications d'identité (dossiers des clients)
router.get("/verifications", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await listVerifications(status));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/verifications/:userId", async (req, res) => {
  try {
    res.json(await getVerificationDetail(req.params.userId as string));
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/verifications/:userId/decision", async (req, res) => {
  try {
    const { decision, note } = req.body as { decision?: string; note?: string };
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return res.status(400).json({ error: "Décision invalide.", code: "VALIDATION", params: { field: "decision" } });
    }
    const updated = await decideVerification(req.auth!.userId, req.params.userId as string, decision, note);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

export default router;
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("../errors");
const errors_2 = require("../errors");
const admin_verification_service_1 = require("../modules/verification/admin-verification.service");
const requireSuperAdmin_1 = require("../middleware/requireSuperAdmin");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const requireAdmin_1 = require("../middleware/requireAdmin");
const repayment_service_1 = require("../modules/repayments/repayment.service");
const points_service_1 = require("../modules/points/points.service");
const risk_service_1 = require("../modules/risk/risk.service");
const blacklist_service_1 = require("../modules/blacklist/blacklist.service");
const wallet_service_1 = require("../modules/wallet/wallet.service");
const withdrawal_service_1 = require("../modules/wallet/withdrawal.service");
const admin_dashboard_service_1 = require("../modules/dashboard/admin-dashboard.service");
const aid_request_service_1 = require("../modules/aid-requests/aid-request.service");
const admin_user_service_1 = require("../modules/users/admin-user.service");
const auth_controller_1 = require("../modules/users/auth.controller");
const admin_team_service_1 = require("../modules/admins/admin-team.service");
const schemas_1 = require("../validation/schemas");
const payment_service_1 = require("../modules/payments/payment.service");
const notification_service_1 = require("../modules/notifications/notification.service");
const audit_service_1 = require("../modules/audit/audit.service");
const message_service_1 = require("../modules/messages/message.service");
const admin_settings_routes_1 = __importDefault(require("./admin.settings.routes"));
const analytics_service_1 = require("../modules/analytics/analytics.service");
const reset_service_1 = require("../modules/admin/reset.service");
const client_1 = require("../db/client");
const mypvit_client_1 = require("../modules/payments/mypvit.client");
const env_1 = require("../config/env");
const VALID_OPERATORS = ["AIRTEL_MONEY", "MOOV_MONEY", "VISA_MASTERCARD"];
function parseOperatorParam(value) {
    if (typeof value === "string" && VALID_OPERATORS.includes(value))
        return value;
    return "AIRTEL_MONEY";
}
const validate_1 = require("../middleware/validate");
const schemas_2 = require("../validation/schemas");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth, requireAdmin_1.requireAdmin);
router.use("/settings", admin_settings_routes_1.default);
router.get("/payments/pending", async (_req, res) => {
    const items = await client_1.prisma.paymentTransaction.findMany({
        where: { status: "PENDING" },
        include: { user: { select: { name: true, phone: true } } },
        orderBy: { createdAt: "asc" },
    });
    res.json(items);
});
router.post("/payments/:id/confirm", (0, validate_1.validateBody)(schemas_1.confirmPaymentSchema), async (req, res) => {
    try {
        res.json(await (0, payment_service_1.confirmPaymentManually)(req.params.id, req.auth.userId, req.body.providerReference));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/payments/:id/reject", (0, validate_1.validateBody)(schemas_1.rejectPaymentSchema), async (req, res) => {
    try {
        res.json(await (0, payment_service_1.rejectPaymentManually)(req.params.id, req.auth.userId, req.body.reason));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/admins", async (_req, res) => {
    res.json(await (0, admin_team_service_1.listAdmins)());
});
// Création directe d'un administrateur (rôle ADMIN, compte actif) : pas de parcours client, pas de message de bienvenue
router.post("/admins", requireSuperAdmin_1.requireSuperAdmin, (0, validate_1.validateBody)(schemas_2.adminCreateUserSchema), async (req, res) => {
    try {
        const admin = await (0, admin_team_service_1.createAdmin)(req.auth.userId, req.body);
        res.json(admin);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/admins/audit", requireSuperAdmin_1.requireSuperAdmin, async (_req, res) => {
    res.json(await (0, admin_team_service_1.listAdminAudit)());
});
router.patch("/admins/:id/super", requireSuperAdmin_1.requireSuperAdmin, (0, validate_1.validateBody)(schemas_1.adminSuperSchema), async (req, res) => {
    try {
        const admin = await (0, admin_team_service_1.setSuperAdmin)(req.auth.userId, req.params.id, req.body.isSuperAdmin);
        res.json(admin);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.patch("/admins/:id/status", requireSuperAdmin_1.requireSuperAdmin, (0, validate_1.validateBody)(schemas_1.adminStatusSchema), async (req, res) => {
    try {
        const admin = await (0, admin_team_service_1.setAdminStatus)(req.auth.userId, req.params.id, req.body.status);
        res.json(admin);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/admins/:id/reset-password", requireSuperAdmin_1.requireSuperAdmin, (0, validate_1.validateBody)(schemas_2.adminResetPasswordSchema), async (req, res) => {
    try {
        res.json(await (0, admin_team_service_1.resetAdminPassword)(req.auth.userId, req.params.id, req.body.newPassword));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/dashboard", async (_req, res) => {
    const data = await (0, admin_dashboard_service_1.getAdminDashboard)();
    res.json(data);
});
router.get("/users", async (req, res) => {
    try {
        const { status, q } = req.query;
        // Cette liste sert à gérer les CLIENTS. Les comptes ADMIN ont leur propre
        // écran ("Gérer les administrateurs") — on ne veut pas qu'un admin
        // apparaisse ici et puisse être suspendu par erreur comme un client.
        const where = { role: "CLIENT" };
        if (status)
            where.status = status;
        if (q) {
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { referralCode: { contains: q, mode: "insensitive" } },
            ];
        }
        const users = await client_1.prisma.user.findMany({
            where,
            orderBy: { createdAt: "desc" },
        });
        res.json(users);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/users/:id", async (req, res) => {
    try {
        const user = await client_1.prisma.user.findUniqueOrThrow({
            where: { id: req.params.id },
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
    }
    catch (err) {
        res.status(404).json({ error: "Utilisateur introuvable" });
    }
});
// Bonus de points de confiance décidé par un admin (bon remboursement, fidélité, fêtes…).
// Le client reçoit une notification avec le message de l'admin et les points ajoutés.
router.post("/users/:id/bonus", requireSuperAdmin_1.requireSuperAdmin, async (req, res) => {
    try {
        const { points, message } = req.body;
        const delta = Number(points);
        const text = (message || "").trim();
        if (!Number.isInteger(delta) || delta < 1 || delta > 100) {
            return res.status(400).json({ error: "Le bonus doit être un nombre entier entre 1 et 100 points." });
        }
        if (text.length < 3 || text.length > 280) {
            return res.status(400).json({ error: "Écris un message de 3 à 280 caractères pour le client." });
        }
        const userId = req.params.id;
        const result = await (0, points_service_1.addPoints)(userId, delta, "bonus_admin");
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "points_bonus",
            entityType: "User",
            entityId: userId,
            after: { bonus: delta, points: result.points },
            note: text,
        });
        await (0, notification_service_1.notifyUser)(userId, "trust_bonus", { text, delta });
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Normalisation des numéros pour retrouver un client saisi sous différentes formes.
function canonicalPhone(raw) {
    let p = raw.replace(/[^\d+]/g, "");
    if (p.startsWith("00"))
        p = "+" + p.slice(2);
    if (p.startsWith("+241"))
        p = "0" + p.slice(4);
    else if (/^241\d{8}$/.test(p))
        p = "0" + p.slice(3);
    return p;
}
function phoneVariants(raw) {
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
router.post("/gifts", requireSuperAdmin_1.requireSuperAdmin, async (req, res) => {
    try {
        const { target, phone, type, amount, message } = req.body;
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
        let recipientIds;
        let targetUserId = null;
        if (target === "ALL") {
            const actives = await client_1.prisma.user.findMany({
                where: { role: "CLIENT", status: "ACTIVE" },
                select: { id: true },
            });
            recipientIds = actives.map((u) => u.id);
        }
        else if (target === "USER") {
            const user = await client_1.prisma.user.findFirst({
                where: { role: "CLIENT", phone: { in: phoneVariants(String(phone || "")) } },
                select: { id: true },
            });
            if (!user) {
                return res.status(400).json({ error: "Aucun client ne correspond à ce numéro." });
            }
            recipientIds = [user.id];
            targetUserId = user.id;
        }
        else {
            return res.status(400).json({ error: "Destinataire invalide." });
        }
        if (recipientIds.length === 0) {
            return res.status(400).json({ error: "Aucun client actif à récompenser." });
        }
        const reward = type === "POINTS"
            ? `Tu reçois ${value} points de niveau de confiance.`
            : `${value} FCFA ont été crédités sur ton portefeuille AIFI.`;
        let delivered = 0;
        for (const id of recipientIds) {
            try {
                if (type === "POINTS")
                    await (0, points_service_1.addPoints)(id, value, "cadeau_admin");
                else
                    await (0, wallet_service_1.creditWallet)(id, value, "cadeau_admin");
                await (0, notification_service_1.notifyUser)(id, "gift", { text, reward });
                delivered++;
            }
            catch (err) {
                console.error(`[gifts] échec pour le client ${id} :`, err);
            }
        }
        const gift = await client_1.prisma.gift.create({
            data: {
                adminId: req.auth.userId,
                target,
                userId: targetUserId,
                type,
                amount: value,
                message: text,
                recipients: delivered,
            },
        });
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "gift_sent",
            entityType: "Gift",
            entityId: gift.id,
            after: { target, type, amount: value, recipients: delivered },
            note: text,
        });
        res.json({ recipients: delivered, giftId: gift.id });
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/gifts", requireSuperAdmin_1.requireSuperAdmin, async (_req, res) => {
    try {
        res.json(await client_1.prisma.gift.findMany({ orderBy: { createdAt: "desc" }, take: 50 }));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Vue globale du risque (répartition, tranches de retard, plus gros dossiers).
router.get("/risk-overview", async (_req, res) => {
    try {
        res.json(await (0, risk_service_1.getRiskOverview)());
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Liste noire : consultation, ajout manuel, retrait (journalisé).
router.get("/blacklist", async (_req, res) => {
    try {
        res.json(await (0, blacklist_service_1.listEntries)());
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/blacklist", async (req, res) => {
    try {
        const { phone, reason } = req.body;
        const text = (reason || "").trim();
        if (!phone || phone.replace(/\D/g, "").length < 6) {
            return res.status(400).json({ error: "Saisis un numéro de téléphone valide." });
        }
        if (text.length < 3) {
            return res.status(400).json({ error: "Indique le motif de l'ajout." });
        }
        const entry = await (0, blacklist_service_1.addManualEntry)(phone, text);
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "blacklist_add",
            entityType: "BlacklistEntry",
            entityId: entry.id,
            after: { phone: entry.phone },
            note: text,
        });
        res.json(entry);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/blacklist/:id/remove", async (req, res) => {
    try {
        const text = (req.body.reason || "").trim();
        if (text.length < 3) {
            return res.status(400).json({ error: "Indique le motif du retrait." });
        }
        const entry = await (0, blacklist_service_1.removeEntry)(req.params.id, text);
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "blacklist_remove",
            entityType: "BlacklistEntry",
            entityId: entry.id,
            note: text,
        });
        res.json(entry);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Situation de risque d'un client (paliers de retard, points, date de blocage).
router.get("/users/:id/risk", async (req, res) => {
    try {
        res.json(await (0, risk_service_1.getUserRisk)(req.params.id));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/users/:id/premium", async (req, res) => {
    try {
        const { isPremium, durationDays } = req.body;
        const before = await client_1.prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
        const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
        // Activation manuelle par un admin : même durée qu'un abonnement trimestriel
        // (il n'existe plus d'accès à vie). Prolonge depuis l'échéance en cours.
        const user = await client_1.prisma.user.update({
            where: { id: req.params.id },
            data: {
                isPremium: !!isPremium,
                premiumSince: isPremium ? before.premiumSince ?? new Date() : before.premiumSince,
                premiumExpiresAt: isPremium
                    ? new Date(Math.max(Date.now(), before.premiumExpiresAt?.getTime() ?? 0) + (durationDays && [30, 90, 180, 365].includes(durationDays) ? durationDays : settings.premiumDurationDays) * 86400000)
                    : null,
            },
        });
        await (0, points_service_1.recomputeCeilingForUser)(user.id);
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: isPremium ? "user_premium_activate" : "user_premium_deactivate",
            entityType: "User",
            entityId: user.id,
            before: { isPremium: before.isPremium },
            after: { isPremium: user.isPremium },
        });
        await (0, notification_service_1.notifyUser)(user.id, isPremium ? "premium_granted" : "premium_deactivated", {});
        res.json({ id: user.id, isPremium: user.isPremium, premiumSince: user.premiumSince, premiumExpiresAt: user.premiumExpiresAt });
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/users/:id/validate", async (req, res) => {
    try {
        const user = await client_1.prisma.user.update({
            where: { id: req.params.id },
            data: { status: "ACTIVE" },
        });
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "user_validate",
            entityType: "User",
            entityId: user.id,
            before: { status: "PENDING" },
            after: { status: "ACTIVE" },
        });
        await (0, points_service_1.addPoints)(user.id, 10, "validation_compte");
        if (user.referredById) {
            const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
            await (0, wallet_service_1.creditWallet)(user.referredById, settings.referralBonus, "referral_bonus");
            await (0, points_service_1.addPoints)(user.referredById, settings.referralPoints, "parrainage_valide");
            await (0, notification_service_1.notifyUser)(user.referredById, "referral_validated", { name: user.name, bonus: settings.referralBonus, points: settings.referralPoints });
        }
        await (0, notification_service_1.notifyUser)(user.id, "account_validated", {});
        res.json(user);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/users/:id/suspend", async (req, res) => {
    try {
        if (req.params.id === req.auth.userId) {
            return res.status(400).json({ error: "Tu ne peux pas suspendre ton propre compte." });
        }
        const user = await (0, admin_user_service_1.suspendUser)(req.params.id, req.auth.userId);
        res.json(user);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/users/:id/reactivate", async (req, res) => {
    try {
        const user = await (0, admin_user_service_1.reactivateUser)(req.params.id, req.auth.userId);
        res.json(user);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.patch("/users/:id", (0, validate_1.validateBody)(schemas_2.adminUpdateUserSchema), async (req, res) => {
    try {
        const { name, phone, points, ceiling } = req.body;
        // Points, plafond et numéro : réservés au super administrateur (le nom reste modifiable par tout admin)
        if ((phone !== undefined || points !== undefined || ceiling !== undefined) && !req.auth.isSuperAdmin) {
            return res.status(403).json({ error: "Action réservée au super-administrateur", code: "SUPER_ADMIN_ONLY" });
        }
        const user = await (0, admin_user_service_1.updateUserInfo)(req.params.id, { name, phone, points, ceiling }, req.auth.userId);
        res.json(user);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/users/:id/reset-password", (0, validate_1.validateBody)(schemas_2.adminResetPasswordSchema), async (req, res) => {
    try {
        const { newPassword } = req.body;
        const result = await (0, auth_controller_1.adminResetPassword)(req.params.id, newPassword);
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "user_reset_password",
            entityType: "User",
            entityId: req.params.id,
        });
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/users/:id/anonymize", async (req, res) => {
    try {
        const user = await (0, admin_user_service_1.anonymizeUser)(req.params.id, req.auth.userId);
        res.json(user);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/aid-requests", async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status)
            where.status = status;
        const requests = await client_1.prisma.aidRequest.findMany({
            where,
            include: { user: { select: { id: true, name: true, phone: true, isPremium: true } }, repayments: true },
            orderBy: { createdAt: "asc" },
        });
        // Priorité AIFI+ : leurs demandes remontent toujours en tête de liste.
        // Prisma ne trie pas sur un champ de relation directement, donc ce tri
        // se fait après coup (le tri par ancienneté ci-dessus reste la règle au
        // sein de chaque groupe, premium comme non-premium).
        requests.sort((a, b) => (a.user.isPremium === b.user.isPremium ? 0 : a.user.isPremium ? -1 : 1));
        res.json(requests);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/aid-requests/:id/accept", async (req, res) => {
    try {
        const result = await (0, aid_request_service_1.acceptAidRequest)(req.params.id, req.auth.userId);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/aid-requests/:id/reject", async (req, res) => {
    try {
        const result = await (0, aid_request_service_1.rejectAidRequest)(req.params.id, req.auth.userId);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/aid-requests/:id/disburse", async (req, res) => {
    try {
        const { note } = req.body;
        const result = await (0, aid_request_service_1.disburseAidRequest)(req.params.id, req.auth.userId, note);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/payments/config", async (_req, res) => {
    res.json({ available: (0, env_1.isMypvitConfigured)() });
});
router.post("/aid-requests/:id/disburse-mypvit", async (req, res) => {
    try {
        const result = await (0, aid_request_service_1.disburseAidRequestViaMypvit)(req.params.id, req.auth.userId);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/aid-requests/:id/repayments", (0, validate_1.validateBody)(schemas_2.recordRepaymentSchema), async (req, res) => {
    try {
        const { amount, proofImageUrl } = req.body;
        if (!proofImageUrl) {
            throw new errors_2.AppError("PROOF_REQUIRED", "Un justificatif (image) est requis pour enregistrer un dépôt");
        }
        const result = await (0, repayment_service_1.recordRepayment)(req.params.id, amount, req.auth.userId, proofImageUrl);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Recherche un utilisateur par numéro de téléphone avec ses aides en cours de
// remboursement — sert d'écran "dépôt facilité" : l'admin saisit le numéro,
// choisit l'aide concernée, entre le montant et joint son justificatif.
router.get("/users/lookup-by-phone", async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone)
            throw new errors_2.AppError("PHONE_REQUIRED", "Numéro de téléphone requis");
        const user = await client_1.prisma.user.findFirst({
            where: { phone: { contains: phone } },
            include: {
                aidRequests: {
                    where: { status: { in: ["ACCEPTED", "DISBURSED", "LATE"] } },
                    include: { repayments: true },
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        if (!user)
            return res.status(404).json({ error: "Aucun utilisateur trouvé avec ce numéro" });
        res.json(user);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/repayment-declarations", async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status)
            where.status = status;
        const declarations = await client_1.prisma.repaymentDeclaration.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, phone: true } },
                aidRequest: { select: { id: true, amount: true, status: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(declarations);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/repayment-declarations/:id/confirm", (0, validate_1.validateBody)(schemas_2.confirmDeclarationSchema), async (req, res) => {
    try {
        const { proofImageUrl } = req.body;
        const result = await (0, repayment_service_1.confirmRepaymentDeclaration)(req.params.id, req.auth.userId, proofImageUrl);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/repayment-declarations/:id/reject", (0, validate_1.validateBody)(schemas_2.rejectDeclarationSchema), async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await (0, repayment_service_1.rejectRepaymentDeclaration)(req.params.id, req.auth.userId, reason);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/withdrawals", async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status)
            where.status = status;
        const withdrawals = await client_1.prisma.withdrawal.findMany({
            where,
            include: { user: { select: { id: true, name: true, phone: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(withdrawals);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/withdrawals/:id/approve", (0, validate_1.validateBody)(schemas_2.approveWithdrawalSchema), async (req, res) => {
    try {
        const { proofImageUrl } = req.body;
        const withdrawal = await (0, withdrawal_service_1.approveWithdrawal)(req.params.id, req.auth.userId, proofImageUrl);
        res.json(withdrawal);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/withdrawals/:id/approve-mypvit", async (req, res) => {
    try {
        const withdrawal = await (0, withdrawal_service_1.approveWithdrawalViaMypvit)(req.params.id, req.auth.userId);
        res.json(withdrawal);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/withdrawals/:id/reject", async (req, res) => {
    try {
        const withdrawal = await (0, withdrawal_service_1.rejectWithdrawal)(req.params.id, req.auth.userId);
        res.json(withdrawal);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Outils de diagnostic MyPVit — utiles pour confirmer le bon fonctionnement
// des endpoints dont le format n'est pas publiquement documenté (voir notes
// dans mypvit.client.ts) avant de s'appuyer dessus en production.
// ?operator=AIRTEL_MONEY|MOOV_MONEY|VISA_MASTERCARD (défaut AIRTEL_MONEY) — précise
// quel compte marchand utiliser, puisque chacun a son propre operationAccountCode.
router.get("/payments/mypvit/operators", async (req, res) => {
    const operator = parseOperatorParam(req.query.operator);
    const operators = await (0, mypvit_client_1.getOperators)(operator);
    res.json({ operator, operators, note: "Liste vide = appel indisponible ou format de réponse inattendu." });
});
router.get("/audit-logs", async (req, res) => {
    try {
        const { entityType, entityId, adminId } = req.query;
        const logs = await (0, audit_service_1.listAuditLogs)({ entityType, entityId, adminId });
        res.json(logs);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/conversations", async (_req, res) => {
    try {
        const conversations = await (0, message_service_1.listConversationsForAdmin)();
        res.json(conversations);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/conversations/:clientId/messages", async (req, res) => {
    try {
        const messages = await (0, message_service_1.getThread)(req.params.clientId);
        await (0, message_service_1.markThreadRead)(req.params.clientId, "ADMIN");
        res.json(messages);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/conversations/:clientId/messages", (0, validate_1.validateBody)(schemas_2.sendMessageSchema), async (req, res) => {
    try {
        const { text, imageUrl } = req.body;
        const message = await (0, message_service_1.sendAdminMessage)(req.params.clientId, req.auth.userId, text, imageUrl);
        res.json(message);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/analytics", async (_req, res) => {
    try {
        const analytics = await (0, analytics_service_1.getAnalytics)();
        res.json(analytics);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Remise à zéro complète des données de test avant le vrai lancement en
// production — irréversible, protégée par une phrase de confirmation exacte
// envoyée par le client (en plus de la confirmation déjà faite côté écran).
router.post("/reset-data", requireSuperAdmin_1.requireSuperAdmin, async (req, res) => {
    if (!env_1.env.allowDataReset) {
        return res.status(403).json({ error: "La réinitialisation des données est désactivée sur ce serveur." });
    }
    try {
        if (req.body?.confirmation !== "REINITIALISER") {
            return res.status(400).json({ error: "Confirmation manquante ou incorrecte." });
        }
        const result = await (0, reset_service_1.resetAllTestData)();
        // Journalisé APRÈS la suppression (le journal d'audit lui-même vient
        // d'être vidé par resetAllTestData) : c'est volontairement la seule
        // trace qui survit à une remise à zéro.
        await (0, audit_service_1.logAction)({
            adminId: req.auth.userId,
            action: "full_data_reset",
            entityType: "System",
            after: result,
            note: "Toutes les données transactionnelles et tous les comptes clients ont été supprimés.",
        });
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Vérifications d'identité (dossiers des clients)
router.get("/verifications", async (req, res) => {
    try {
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        res.json(await (0, admin_verification_service_1.listVerifications)(status));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/verifications/:userId", async (req, res) => {
    try {
        res.json(await (0, admin_verification_service_1.getVerificationDetail)(req.params.userId));
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/verifications/:userId/decision", async (req, res) => {
    try {
        const { decision, note } = req.body;
        if (decision !== "APPROVE" && decision !== "REJECT") {
            return res.status(400).json({ error: "Décision invalide.", code: "VALIDATION", params: { field: "decision" } });
        }
        const updated = await (0, admin_verification_service_1.decideVerification)(req.auth.userId, req.params.userId, decision, note);
        res.json(updated);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("../errors");
const errors_2 = require("../errors");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const client_1 = require("../db/client");
const client_dashboard_service_1 = require("../modules/dashboard/client-dashboard.service");
const withdrawal_service_1 = require("../modules/wallet/withdrawal.service");
const aid_request_service_1 = require("../modules/aid-requests/aid-request.service");
const message_service_1 = require("../modules/messages/message.service");
const payment_service_1 = require("../modules/payments/payment.service");
const mypvit_client_1 = require("../modules/payments/mypvit.client");
const env_1 = require("../config/env");
const validate_1 = require("../middleware/validate");
const verification_service_1 = require("../modules/verification/verification.service");
const schemas_1 = require("../validation/schemas");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get("/dashboard", async (req, res) => {
    const data = await (0, client_dashboard_service_1.getClientDashboard)(req.auth.userId);
    res.json(data);
});
router.get("/settings", async (_req, res) => {
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    res.json({
        minRepaymentAmount: settings.minRepaymentAmount,
        minWithdrawal: settings.minWithdrawal,
        serviceFeePercent: settings.serviceFeePercent,
        premiumServiceFeePercent: settings.premiumServiceFeePercent,
        premiumPrice: settings.premiumPrice,
        premiumDurationDays: settings.premiumDurationDays,
        freePointsCap: settings.freePointsCap,
        premiumGraceDays: settings.premiumGraceDays,
        standardGraceDays: settings.standardGraceDays,
        flexibleDueMinPoints: settings.flexibleDueMinPoints,
        repaymentReceivingOperator: settings.repaymentReceivingOperator,
        repaymentReceivingPhone: settings.repaymentReceivingPhone,
        repaymentReceivingName: settings.repaymentReceivingName,
        communityMessage: settings.communityMessage,
        communityShareText: settings.communityShareText,
        communityLinks: settings.communityLinks,
    });
});
router.get("/ceiling-tiers", async (_req, res) => {
    const tiers = await client_1.prisma.ceilingTier.findMany({ orderBy: { minPoints: "asc" } });
    res.json(tiers);
});
router.get("/duration-tiers", async (_req, res) => {
    const tiers = await client_1.prisma.durationTier.findMany({ orderBy: { minAmount: "asc" } });
    res.json(tiers);
});
router.get("/wallet", async (req, res) => {
    const entries = await client_1.prisma.walletEntry.findMany({
        where: { userId: req.auth.userId },
        orderBy: { createdAt: "desc" },
    });
    const balance = entries.reduce((sum, e) => sum + e.amount, 0);
    res.json({ balance, entries });
});
router.get("/referrals", async (req, res) => {
    const referrals = await client_1.prisma.user.findMany({
        where: { referredById: req.auth.userId },
        select: { id: true, name: true, status: true, createdAt: true },
    });
    res.json(referrals);
});
router.post("/wallet/withdraw", (0, validate_1.validateBody)(schemas_1.requestWithdrawalSchema), async (req, res) => {
    try {
        const { amount, receivingOperator, receivingPhone, receivingName } = req.body;
        const result = await (0, withdrawal_service_1.requestWithdrawal)(req.auth.userId, amount, receivingOperator, receivingPhone, receivingName);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/aid-requests", (0, validate_1.validateBody)(schemas_1.requestAidSchema), async (req, res) => {
    try {
        const { amount, receivingOperator, receivingPhone, receivingName, requestedDurationDays } = req.body;
        const result = await (0, aid_request_service_1.requestAid)(req.auth.userId, amount, receivingOperator, receivingPhone, receivingName, requestedDurationDays);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Devis avant confirmation : montant total, échéance, sursis, et si la date est au choix.
router.get("/aid-requests/quote", async (req, res) => {
    const parsed = schemas_1.aidQuoteQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: "Montant ou durée invalide.", code: "INVALID_QUOTE" });
    }
    try {
        const { amount, requestedDurationDays } = parsed.data;
        const quote = await (0, aid_request_service_1.quoteAidRequest)(req.auth.userId, amount, requestedDurationDays);
        res.json(quote);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/aid-requests", async (req, res) => {
    const requests = await client_1.prisma.aidRequest.findMany({
        where: { userId: req.auth.userId },
        include: { repayments: true, repaymentDeclarations: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
    });
    res.json(requests);
});
router.get("/payments/config", async (_req, res) => {
    res.json({ available: (0, env_1.isMypvitConfigured)() });
});
router.post("/aid-requests/:id/repayments/pay", (0, validate_1.validateBody)(schemas_1.payRepaymentSchema), async (req, res) => {
    try {
        if (!(0, env_1.isMypvitConfigured)()) {
            throw new errors_2.AppError("MOBILE_MONEY_DISABLED", "Le paiement Mobile Money n'est pas encore activé. Utilise la déclaration manuelle.");
        }
        const { amount, operatorCode, phone, name } = req.body;
        const op = operatorCode || (0, mypvit_client_1.detectOperator)((await client_1.prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } })).phone);
        if (!op)
            throw new errors_2.AppError("OPERATOR_UNKNOWN", "Impossible de déterminer l'opérateur Mobile Money. Précise-le.");
        const result = await (0, payment_service_1.startRepaymentPayment)(req.auth.userId, req.params.id, amount, op, phone, name);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/premium/subscribe", (0, validate_1.validateBody)(schemas_1.premiumSubscribeSchema), async (req, res) => {
    try {
        if (!(0, env_1.isMypvitConfigured)()) {
            throw new errors_2.AppError("MOBILE_MONEY_DISABLED", "Le paiement Mobile Money n'est pas encore activé.");
        }
        const { operatorCode, phone, name } = req.body;
        const result = await (0, payment_service_1.startPremiumSubscriptionPayment)(req.auth.userId, operatorCode, phone, name);
        res.json(result);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/payments/:transactionId/status", async (req, res) => {
    try {
        const transaction = await (0, payment_service_1.getPaymentStatus)(req.params.transactionId, req.auth.userId);
        res.json({ status: transaction.status, amount: transaction.amount, operator: transaction.operator });
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.get("/messages", async (req, res) => {
    try {
        const messages = await (0, message_service_1.getThread)(req.auth.userId);
        await (0, message_service_1.markThreadRead)(req.auth.userId, "CLIENT");
        res.json(messages);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.post("/messages", (0, validate_1.validateBody)(schemas_1.sendMessageSchema), async (req, res) => {
    try {
        const { text, imageUrl } = req.body;
        const message = await (0, message_service_1.sendClientMessage)(req.auth.userId, text, imageUrl);
        res.json(message);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
// Vérification d'identité (paramètres du client)
router.get("/verification", async (req, res) => {
    try {
        const verification = await (0, verification_service_1.getMyVerification)(req.auth.userId);
        res.json(verification);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
router.put("/verification", (0, validate_1.validateBody)(schemas_1.submitVerificationSchema), async (req, res) => {
    try {
        const verification = await (0, verification_service_1.submitVerification)(req.auth.userId, req.body);
        res.json(verification);
    }
    catch (err) {
        res.status(400).json((0, errors_1.errorBody)(err));
    }
});
exports.default = router;

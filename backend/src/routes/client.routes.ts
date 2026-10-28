import { errorBody } from "../errors";
import { AppError } from "../errors";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/client";
import { getClientDashboard } from "../modules/dashboard/client-dashboard.service";
import { requestWithdrawal } from "../modules/wallet/withdrawal.service";
import { requestAid, quoteAidRequest } from "../modules/aid-requests/aid-request.service";
import { sendClientMessage, getThread, markThreadRead } from "../modules/messages/message.service";
import { startRepaymentPayment, getPaymentStatus, startPremiumSubscriptionPayment } from "../modules/payments/payment.service";
import { detectOperator } from "../modules/payments/mypvit.client";
import { isMypvitConfigured } from "../config/env";
import { validateBody } from "../middleware/validate";
import { getMyVerification, submitVerification } from "../modules/verification/verification.service";
import {
  requestWithdrawalSchema,
  requestAidSchema,
  aidQuoteQuerySchema,
  payRepaymentSchema,
  sendMessageSchema,
  premiumSubscribeSchema,
  submitVerificationSchema,
} from "../validation/schemas";

const router = Router();

router.use(requireAuth);

router.get("/dashboard", async (req, res) => {
  const data = await getClientDashboard(req.auth!.userId);
  res.json(data);
});

router.get("/settings", async (_req, res) => {
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
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
  const tiers = await prisma.ceilingTier.findMany({ orderBy: { minPoints: "asc" } });
  res.json(tiers);
});

router.get("/duration-tiers", async (_req, res) => {
  const tiers = await prisma.durationTier.findMany({ orderBy: { minAmount: "asc" } });
  res.json(tiers);
});

router.get("/wallet", async (req, res) => {
  const entries = await prisma.walletEntry.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
  });
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);
  res.json({ balance, entries });
});

router.get("/referrals", async (req, res) => {
  const referrals = await prisma.user.findMany({
    where: { referredById: req.auth!.userId },
    select: { id: true, name: true, status: true, createdAt: true },
  });
  res.json(referrals);
});

router.post("/wallet/withdraw", validateBody(requestWithdrawalSchema), async (req, res) => {
  try {
    const { amount, receivingOperator, receivingPhone, receivingName } = req.body;
    const result = await requestWithdrawal(req.auth!.userId, amount, receivingOperator, receivingPhone, receivingName);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/aid-requests", validateBody(requestAidSchema), async (req, res) => {
  try {
    const { amount, receivingOperator, receivingPhone, receivingName, requestedDurationDays } = req.body;
    const result = await requestAid(
      req.auth!.userId,
      amount,
      receivingOperator,
      receivingPhone,
      receivingName,
      requestedDurationDays
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Devis avant confirmation : montant total, échéance, sursis, et si la date est au choix.
router.get("/aid-requests/quote", async (req, res) => {
  const parsed = aidQuoteQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Montant ou durée invalide.", code: "INVALID_QUOTE" });
  }
  try {
    const { amount, requestedDurationDays } = parsed.data;
    const quote = await quoteAidRequest(req.auth!.userId, amount, requestedDurationDays);
    res.json(quote);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/aid-requests", async (req, res) => {
  const requests = await prisma.aidRequest.findMany({
    where: { userId: req.auth!.userId },
    include: { repayments: true, repaymentDeclarations: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(requests);
});


router.get("/payments/config", async (_req, res) => {
  res.json({ available: isMypvitConfigured() });
});

router.post("/aid-requests/:id/repayments/pay", validateBody(payRepaymentSchema), async (req, res) => {
  try {
    if (!isMypvitConfigured()) {
      throw new AppError("MOBILE_MONEY_DISABLED", "Le paiement Mobile Money n'est pas encore activé. Utilise la déclaration manuelle.");
    }
    const { amount, operatorCode, phone, name } = req.body;
    const op = operatorCode || detectOperator((await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } })).phone);
    if (!op) throw new AppError("OPERATOR_UNKNOWN", "Impossible de déterminer l'opérateur Mobile Money. Précise-le.");
    const result = await startRepaymentPayment(req.auth!.userId, (req.params.id as string), amount, op, phone, name);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/premium/subscribe", validateBody(premiumSubscribeSchema), async (req, res) => {
  try {
    if (!isMypvitConfigured()) {
      throw new AppError("MOBILE_MONEY_DISABLED", "Le paiement Mobile Money n'est pas encore activé.");
    }
    const { operatorCode, phone, name } = req.body;
    const result = await startPremiumSubscriptionPayment(req.auth!.userId, operatorCode, phone, name);
    res.json(result);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/payments/:transactionId/status", async (req, res) => {
  try {
    const transaction = await getPaymentStatus((req.params.transactionId as string), req.auth!.userId);
    res.json({ status: transaction.status, amount: transaction.amount, operator: transaction.operator });
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.get("/messages", async (req, res) => {
  try {
    const messages = await getThread(req.auth!.userId);
    await markThreadRead(req.auth!.userId, "CLIENT");
    res.json(messages);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.post("/messages", validateBody(sendMessageSchema), async (req, res) => {
  try {
    const { text, imageUrl } = req.body;
    const message = await sendClientMessage(req.auth!.userId, text, imageUrl);
    res.json(message);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

// Vérification d'identité (paramètres du client)
router.get("/verification", async (req, res) => {
  try {
    const verification = await getMyVerification(req.auth!.userId);
    res.json(verification);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

router.put("/verification", validateBody(submitVerificationSchema), async (req, res) => {
  try {
    const verification = await submitVerification(req.auth!.userId, req.body);
    res.json(verification);
  } catch (err: any) {
    res.status(400).json(errorBody(err));
  }
});

export default router;
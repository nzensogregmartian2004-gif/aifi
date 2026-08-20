import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/client";
import { getClientDashboard } from "../modules/dashboard/client-dashboard.service";
import { requestWithdrawal } from "../modules/wallet/withdrawal.service";
import { requestAid } from "../modules/aid-requests/aid-request.service";
import { declareRepayment } from "../modules/repayments/repayment.service";
import { sendClientMessage, getThread, markThreadRead } from "../modules/messages/message.service";
import { startRepaymentPayment, getPaymentStatus } from "../modules/payments/payment.service";
import { detectOperator } from "../modules/payments/mypvit.client";
import { isMypvitConfigured } from "../config/env";
import { validateBody } from "../middleware/validate";
import {
  requestWithdrawalSchema,
  requestAidSchema,
  declareRepaymentSchema,
  payRepaymentSchema,
  sendMessageSchema,
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
  });
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
    const { amount } = req.body;
    const result = await requestWithdrawal(req.auth!.userId, amount);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/aid-requests", validateBody(requestAidSchema), async (req, res) => {
  try {
    const { amount } = req.body;
    const result = await requestAid(req.auth!.userId, amount);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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

router.post("/aid-requests/:id/repayments/declare", validateBody(declareRepaymentSchema), async (req, res) => {
  try {
    const { amount, note, proofImageUrl } = req.body;
    const result = await declareRepayment(req.auth!.userId, (req.params.id as string), amount, note, proofImageUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/payments/config", async (_req, res) => {
  res.json({ available: isMypvitConfigured() });
});

router.post("/aid-requests/:id/repayments/pay", validateBody(payRepaymentSchema), async (req, res) => {
  try {
    if (!isMypvitConfigured()) {
      throw new Error("Le paiement Mobile Money n'est pas encore activé. Utilise la déclaration manuelle.");
    }
    const { amount, operatorCode } = req.body;
    const op = operatorCode || detectOperator((await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } })).phone);
    if (!op) throw new Error("Impossible de déterminer l'opérateur Mobile Money. Précise-le.");
    const result = await startRepaymentPayment(req.auth!.userId, (req.params.id as string), amount, op);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/payments/:transactionId/status", async (req, res) => {
  try {
    const transaction = await getPaymentStatus((req.params.transactionId as string), req.auth!.userId);
    res.json({ status: transaction.status, amount: transaction.amount, operator: transaction.operator });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/messages", async (req, res) => {
  try {
    const messages = await getThread(req.auth!.userId);
    await markThreadRead(req.auth!.userId, "CLIENT");
    res.json(messages);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/messages", validateBody(sendMessageSchema), async (req, res) => {
  try {
    const { text, imageUrl } = req.body;
    const message = await sendClientMessage(req.auth!.userId, text, imageUrl);
    res.json(message);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
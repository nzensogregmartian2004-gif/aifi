import { z } from "zod";

// Un montant en FCFA : entier positif, borné pour éviter une saisie absurde
// (ex: 15 zéros tapés par erreur) qui casserait un calcul de plafond plus loin.
const amount = z.coerce.number().int().positive().max(10_000_000);
const phone = z.string().trim().min(6).max(20);
const password = z.string().min(6).max(72);
const optionalImageUrl = z.string().max(500).optional();

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone,
  password,
  referralCode: z.string().trim().max(20).optional(),
});

export const loginSchema = z.object({
  phone,
  password: z.string().min(1).max(72), // pas de min(4) ici : ne pas révéler la politique de mot de passe à un attaquant
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: password,
});

export const adminResetPasswordSchema = z.object({
  newPassword: password,
});

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone,
  password,
});

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: phone.optional(),
  points: z.coerce.number().int().min(0).max(100_000).optional(),
  ceiling: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

export const requestAidSchema = z.object({
  amount,
  receivingOperator: z.enum(["AIRTEL_MONEY", "MOOV_MONEY"]),
  receivingPhone: z.string().min(6).max(20),
  receivingName: z.string().min(2).max(100),
});

export const requestWithdrawalSchema = z.object({
  amount,
  receivingOperator: z.enum(["AIRTEL_MONEY", "MOOV_MONEY"]),
  receivingPhone: z.string().min(6).max(20),
  receivingName: z.string().min(2).max(100),
});

export const recordRepaymentSchema = z.object({
  amount,
  proofImageUrl: optionalImageUrl,
});

export const declareRepaymentSchema = z.object({
  amount,
  note: z.string().trim().max(500).optional(),
  proofImageUrl: optionalImageUrl,
});

export const payRepaymentSchema = z.object({
  amount,
  operatorCode: z.enum(["AIRTEL_MONEY", "MOOV_MONEY", "VISA_MASTERCARD"]).optional(),
});

export const rejectDeclarationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const approveWithdrawalSchema = z.object({
  proofImageUrl: z.string().min(1).max(500), // obligatoire à l'approbation
});

export const confirmDeclarationSchema = z.object({
  proofImageUrl: optionalImageUrl,
});

export const sendMessageSchema = z.object({
  text: z.string().trim().max(2000).optional(),
  imageUrl: optionalImageUrl,
});

export const settingsCeilingSchema = z.object({
  minPoints: z.coerce.number().int().min(0),
  ceiling: z.coerce.number().int().positive(),
});

export const settingsUpdateSchema = z.object({
  referralBonus: z.coerce.number().int().min(0).max(1_000_000).optional(),
  referralPoints: z.coerce.number().int().min(0).max(1000).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  minWithdrawal: z.coerce.number().int().min(0).max(10_000_000).optional(),
  minRepaymentAmount: z.coerce.number().int().min(0).max(10_000_000).optional(),
  latePenaltyPoints: z.coerce.number().int().min(0).max(1000).optional(),
  reminderDaysBefore: z.coerce.number().int().min(0).max(60).optional(),
  serviceFeePercent: z.coerce.number().min(0).max(500).optional(),
  defaultDurationDays: z.coerce.number().int().min(1).max(365).optional(),
});

import { z } from "zod";
import { normalizePhone } from "./phone";

export { normalizePhone };

// Un montant en FCFA : entier positif, borné pour éviter une saisie absurde
// (ex: 15 zéros tapés par erreur) qui casserait un calcul de plafond plus loin.
const amount = z.coerce.number().int().positive().max(10_000_000);

const phone = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .transform(normalizePhone)
  .refine((p) => p.length >= 6 && p.length <= 20, { message: "Numéro de téléphone invalide" });
const password = z.string().min(8).max(72);
const imageUrlPath = z.string().max(500).regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "Fichier joint invalide");
const optionalImageUrl = imageUrlPath.optional();

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
  // Durée choisie (en jours) : seulement à partir du seuil de points ; bornes métier dans aid-request.service.ts
  requestedDurationDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const aidQuoteQuerySchema = z.object({
  amount,
  requestedDurationDays: z.coerce.number().int().min(1).max(365).optional(),
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
  phone: z.string().min(6).max(20).optional(), // pour carte, pas de numéro Mobile Money requis
  name: z.string().min(2).max(100).optional(),
});

export const premiumSubscribeSchema = z.object({
  operatorCode: z.enum(["AIRTEL_MONEY", "MOOV_MONEY", "VISA_MASTERCARD"]),
  phone: z.string().min(6).max(20).optional(),
  name: z.string().min(2).max(100).optional(),
});

export const rejectDeclarationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const approveWithdrawalSchema = z.object({
  proofImageUrl: imageUrlPath, // obligatoire à l'approbation
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
  serviceFeePercent: z.coerce.number().min(0).max(500).optional(),
  premiumServiceFeePercent: z.coerce.number().min(0).max(500).optional(),
  premiumGraceDays: z.coerce.number().int().min(0).max(60).optional(),
  standardGraceDays: z.coerce.number().int().min(0).max(60).optional(),
  flexibleDueMinPoints: z.coerce.number().int().min(0).max(100_000).optional(),
  flexibleDueMinDays: z.coerce.number().int().min(1).max(365).optional(),
  latePenaltyPoints: z.coerce.number().int().min(0).max(1000).optional(),
  premiumPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
  premiumDurationDays: z.coerce.number().int().min(30).max(365).optional(),
  freePointsCap: z.coerce.number().int().min(0).max(100_000).optional(),
  repaymentReceivingOperator: z.enum(["AIRTEL_MONEY", "MOOV_MONEY"]).optional(),
  repaymentReceivingPhone: z.string().min(6).max(20).optional(),
  repaymentReceivingName: z.string().min(2).max(100).optional(),
  communityMessage: z.string().max(1000).optional(),
  communityShareText: z.string().max(1000).optional(),
  communityLinks: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        url: z.string().max(500).regex(/^https:\/\/\S+$/, "lien https requis"),
      })
    )
    .max(10)
    .optional(),
});

export const durationTierSchema = z.object({
  minAmount: z.coerce.number().int().positive(),
  durationDays: z.coerce.number().int().positive().max(365),
});

export const submitVerificationSchema = z.object({
  documentType: z.enum(["CNI", "PASSPORT", "RECEPISSE", "CNAMGS", "PERMIS", "OTHER"]),
  frontUrl: imageUrlPath,
  backUrl: optionalImageUrl,
  extraUrls: z.array(imageUrlPath).max(5).default([]),
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitVerificationSchema = exports.durationTierSchema = exports.settingsUpdateSchema = exports.settingsCeilingSchema = exports.sendMessageSchema = exports.confirmDeclarationSchema = exports.approveWithdrawalSchema = exports.rejectDeclarationSchema = exports.premiumSubscribeSchema = exports.payRepaymentSchema = exports.declareRepaymentSchema = exports.recordRepaymentSchema = exports.requestWithdrawalSchema = exports.aidQuoteQuerySchema = exports.requestAidSchema = exports.adminUpdateUserSchema = exports.adminCreateUserSchema = exports.adminResetPasswordSchema = exports.changePasswordSchema = exports.loginSchema = exports.registerSchema = exports.normalizePhone = void 0;
const zod_1 = require("zod");
const phone_1 = require("./phone");
Object.defineProperty(exports, "normalizePhone", { enumerable: true, get: function () { return phone_1.normalizePhone; } });
// Un montant en FCFA : entier positif, borné pour éviter une saisie absurde
// (ex: 15 zéros tapés par erreur) qui casserait un calcul de plafond plus loin.
const amount = zod_1.z.coerce.number().int().positive().max(10000000);
const phone = zod_1.z
    .string()
    .trim()
    .min(6)
    .max(20)
    .transform(phone_1.normalizePhone)
    .refine((p) => p.length >= 6 && p.length <= 20, { message: "Numéro de téléphone invalide" });
const password = zod_1.z.string().min(8).max(72);
const imageUrlPath = zod_1.z.string().max(500).regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "Fichier joint invalide");
const optionalImageUrl = imageUrlPath.optional();
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(100),
    phone,
    password,
    referralCode: zod_1.z.string().trim().max(20).optional(),
});
exports.loginSchema = zod_1.z.object({
    phone,
    password: zod_1.z.string().min(1).max(72), // pas de min(4) ici : ne pas révéler la politique de mot de passe à un attaquant
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1).max(72),
    newPassword: password,
});
exports.adminResetPasswordSchema = zod_1.z.object({
    newPassword: password,
});
exports.adminCreateUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(100),
    phone,
    password,
});
exports.adminUpdateUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(100).optional(),
    phone: phone.optional(),
    points: zod_1.z.coerce.number().int().min(0).max(100000).optional(),
    ceiling: zod_1.z.coerce.number().int().min(0).max(10000000).optional(),
});
exports.requestAidSchema = zod_1.z.object({
    amount,
    receivingOperator: zod_1.z.enum(["AIRTEL_MONEY", "MOOV_MONEY"]),
    receivingPhone: zod_1.z.string().min(6).max(20),
    receivingName: zod_1.z.string().min(2).max(100),
    // Durée choisie (en jours) : seulement à partir du seuil de points ; bornes métier dans aid-request.service.ts
    requestedDurationDays: zod_1.z.coerce.number().int().min(1).max(365).optional(),
});
exports.aidQuoteQuerySchema = zod_1.z.object({
    amount,
    requestedDurationDays: zod_1.z.coerce.number().int().min(1).max(365).optional(),
});
exports.requestWithdrawalSchema = zod_1.z.object({
    amount,
    receivingOperator: zod_1.z.enum(["AIRTEL_MONEY", "MOOV_MONEY"]),
    receivingPhone: zod_1.z.string().min(6).max(20),
    receivingName: zod_1.z.string().min(2).max(100),
});
exports.recordRepaymentSchema = zod_1.z.object({
    amount,
    proofImageUrl: optionalImageUrl,
});
exports.declareRepaymentSchema = zod_1.z.object({
    amount,
    note: zod_1.z.string().trim().max(500).optional(),
    proofImageUrl: optionalImageUrl,
});
exports.payRepaymentSchema = zod_1.z.object({
    amount,
    operatorCode: zod_1.z.enum(["AIRTEL_MONEY", "MOOV_MONEY", "VISA_MASTERCARD"]).optional(),
    phone: zod_1.z.string().min(6).max(20).optional(), // pour carte, pas de numéro Mobile Money requis
    name: zod_1.z.string().min(2).max(100).optional(),
});
exports.premiumSubscribeSchema = zod_1.z.object({
    operatorCode: zod_1.z.enum(["AIRTEL_MONEY", "MOOV_MONEY", "VISA_MASTERCARD"]),
    phone: zod_1.z.string().min(6).max(20).optional(),
    name: zod_1.z.string().min(2).max(100).optional(),
});
exports.rejectDeclarationSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().max(500).optional(),
});
exports.approveWithdrawalSchema = zod_1.z.object({
    proofImageUrl: imageUrlPath, // obligatoire à l'approbation
});
exports.confirmDeclarationSchema = zod_1.z.object({
    proofImageUrl: optionalImageUrl,
});
exports.sendMessageSchema = zod_1.z.object({
    text: zod_1.z.string().trim().max(2000).optional(),
    imageUrl: optionalImageUrl,
});
exports.settingsCeilingSchema = zod_1.z.object({
    minPoints: zod_1.z.coerce.number().int().min(0),
    ceiling: zod_1.z.coerce.number().int().positive(),
});
exports.settingsUpdateSchema = zod_1.z.object({
    referralBonus: zod_1.z.coerce.number().int().min(0).max(1000000).optional(),
    referralPoints: zod_1.z.coerce.number().int().min(0).max(1000).optional(),
    commissionPercent: zod_1.z.coerce.number().min(0).max(100).optional(),
    minWithdrawal: zod_1.z.coerce.number().int().min(0).max(10000000).optional(),
    minRepaymentAmount: zod_1.z.coerce.number().int().min(0).max(10000000).optional(),
    serviceFeePercent: zod_1.z.coerce.number().min(0).max(500).optional(),
    premiumServiceFeePercent: zod_1.z.coerce.number().min(0).max(500).optional(),
    premiumGraceDays: zod_1.z.coerce.number().int().min(0).max(60).optional(),
    standardGraceDays: zod_1.z.coerce.number().int().min(0).max(60).optional(),
    flexibleDueMinPoints: zod_1.z.coerce.number().int().min(0).max(100000).optional(),
    flexibleDueMinDays: zod_1.z.coerce.number().int().min(1).max(365).optional(),
    latePenaltyPoints: zod_1.z.coerce.number().int().min(0).max(1000).optional(),
    premiumPrice: zod_1.z.coerce.number().int().min(0).max(1000000).optional(),
    premiumDurationDays: zod_1.z.coerce.number().int().min(30).max(365).optional(),
    freePointsCap: zod_1.z.coerce.number().int().min(0).max(100000).optional(),
    repaymentReceivingOperator: zod_1.z.enum(["AIRTEL_MONEY", "MOOV_MONEY"]).optional(),
    repaymentReceivingPhone: zod_1.z.string().min(6).max(20).optional(),
    repaymentReceivingName: zod_1.z.string().min(2).max(100).optional(),
    communityMessage: zod_1.z.string().max(1000).optional(),
    communityShareText: zod_1.z.string().max(1000).optional(),
    communityLinks: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().min(1).max(40),
        url: zod_1.z.string().max(500).regex(/^https:\/\/\S+$/, "lien https requis"),
    }))
        .max(10)
        .optional(),
});
exports.durationTierSchema = zod_1.z.object({
    minAmount: zod_1.z.coerce.number().int().positive(),
    durationDays: zod_1.z.coerce.number().int().positive().max(365),
});
exports.submitVerificationSchema = zod_1.z.object({
    documentType: zod_1.z.enum(["CNI", "PASSPORT", "RECEPISSE", "CNAMGS", "PERMIS", "OTHER"]),
    frontUrl: imageUrlPath,
    backUrl: optionalImageUrl,
    extraUrls: zod_1.z.array(imageUrlPath).max(5).default([]),
});

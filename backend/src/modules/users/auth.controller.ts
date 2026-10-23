import { AppError } from "../../errors";
import { isPhoneBlacklisted } from "../blacklist/blacklist.service";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../../db/client";
import { signToken } from "../../middleware/auth";
import { sendAdminMessage } from "../messages/message.service";

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // ex: "A1B2C3D4"
}

/** Erreur métier avec un code stable : l'app traduit le code, le message sert de repli. */
export class AuthError extends Error {
  code: string;
  params?: Record<string, unknown>;
  constructor(code: string, message: string, params?: Record<string, unknown>) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.params = params;
  }
}

// Verrouillage par numéro de téléphone : protège même contre une attaque distribuée
// sur plusieurs IP. Stocké en base : un redémarrage du serveur ne remet pas à zéro.
const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

async function checkLock(phone: string) {
  const entry = await prisma.loginAttempt.findUnique({ where: { phone } });
  if (entry?.lockedUntil && entry.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((entry.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AuthError("LOCKED", `Trop de tentatives échouées. Réessaie dans ${minutes} min.`, { minutes });
  }
}

async function registerFailedAttempt(phone: string) {
  const now = new Date();
  const entry = await prisma.loginAttempt.findUnique({ where: { phone } });

  if (!entry || now.getTime() - entry.firstAttemptAt.getTime() > LOCK_WINDOW_MS) {
    await prisma.loginAttempt.upsert({
      where: { phone },
      create: { phone, count: 1, firstAttemptAt: now, lockedUntil: null },
      update: { count: 1, firstAttemptAt: now, lockedUntil: null },
    });
    return;
  }

  const count = entry.count + 1;
  await prisma.loginAttempt.update({
    where: { phone },
    data: {
      count,
      lockedUntil: count >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_WINDOW_MS) : entry.lockedUntil,
    },
  });
}

async function clearAttempts(phone: string) {
  await prisma.loginAttempt.deleteMany({ where: { phone } });
}

/** Supprime les compteurs de plus de 24 h (appelé par le planificateur). */
export async function purgeOldLoginAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.loginAttempt.deleteMany({ where: { firstAttemptAt: { lt: cutoff } } });
  return result.count;
}

export async function register(name: string, phone: string, password: string, referralCode?: string) {
  if (await isPhoneBlacklisted(phone)) {
    throw new AuthError("PHONE_BLACKLISTED", "Inscription impossible avec ce numéro. Contacte le support.");
  }
  const passwordHash = await bcrypt.hash(password, 10);

  let referredById: string | undefined;
  if (referralCode) {
    const sponsor = await prisma.user.findUnique({ where: { referralCode } });
    if (!sponsor) throw new AuthError("INVALID_REFERRAL", "Code de parrainage invalide");
    referredById = sponsor.id;
  }

  let code = generateReferralCode();
  while (await prisma.user.findUnique({ where: { referralCode: code } })) {
    code = generateReferralCode(); // évite une collision improbable mais possible
  }

  const user = await prisma.user.create({
    data: { name, phone, passwordHash, referralCode: code, referredById },
  });

  await sendWelcomeMessage(user.id);

  return user;
}

/**
 * Message automatique envoyé par un administrateur juste après l'inscription,
 * expliquant ce qu'il faut fournir dans "Messages" pour faire valider le
 * compte. Attribué au premier administrateur trouvé (peu importe lequel, il
 * n'y a qu'un seul fil de discussion par client de toute façon).
 */
async function sendWelcomeMessage(clientId: string) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) return; // pas d'admin en base, rien à envoyer (ne doit pas arriver en usage normal)

  const text =
    "Bienvenue sur AIFI ! 🎉\n\n" +
    "Avant de pouvoir demander une aide, ton compte doit être validé. Pour ça, envoie-nous ici, dans ce fil de discussion :\n\n" +
    "1️⃣ Une photo lisible d'une pièce d'identité (carte d'identité, passeport ou permis)\n" +
    "2️⃣ Un selfie de toi tenant cette même pièce d'identité à côté de ton visage\n" +
    "3️⃣ Ton lieu de résidence (quartier + ville)\n\n" +
    "Dès que c'est reçu et vérifié, ton compte sera activé et tu recevras une notification.";

  // Passe par sendAdminMessage (au lieu d'un prisma.message.create direct) pour
  // que la notification en-app + push soit bien créée : sans ça, le message
  // arrive dans le fil de discussion mais l'icône ne signale jamais rien de
  // nouveau, puisque le badge se base sur /notifications/unread-count et non
  // sur les messages eux-mêmes.
  await sendAdminMessage(clientId, admin.id, text);
}


/** Formes possibles d'un numéro gabonais stocké (forme canonique « 0… » + variantes internationales). */
function phoneCandidates(phone: string): string[] {
  const set = new Set([phone]);
  if (phone.startsWith("0")) {
    const local = phone.slice(1);
    set.add(`+241${local}`);
    set.add(`00241${local}`);
    set.add(`241${local}`);
  }
  return [...set];
}

export async function login(phone: string, password: string) {
  await checkLock(phone);

  // Tolère les anciens formats encore stockés (+241…, 00241…, 241…) tant que la
  // migration de normalisation n'a pas touché tous les comptes.
  const user = await prisma.user.findFirst({ where: { phone: { in: phoneCandidates(phone) } } });
  if (!user) {
    await registerFailedAttempt(phone);
    throw new AuthError("INVALID_CREDENTIALS", "Numéro ou mot de passe incorrect");
  }

  if (user.anonymizedAt) {
    await registerFailedAttempt(phone);
    throw new AuthError("INVALID_CREDENTIALS", "Numéro ou mot de passe incorrect");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await registerFailedAttempt(phone);
    throw new AuthError("INVALID_CREDENTIALS", "Numéro ou mot de passe incorrect");
  }

  await clearAttempts(phone);

  // Un compte PENDING peut désormais se connecter (accès restreint géré côté
  // client + côté demande d'aide), pour que le client voie tout de suite son
  // tableau de bord après inscription. Seul un compte SUSPENDED reste bloqué.
  if (user.status === "SUSPENDED") {
    throw new AuthError("ACCOUNT_SUSPENDED", "Compte suspendu. Contacte un administrateur.");
  }

  const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
  return {
    token,
    user: { id: user.id, name: user.name, role: user.role, status: user.status, isSuperAdmin: user.isSuperAdmin },
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AuthError("WRONG_CURRENT_PASSWORD", "Mot de passe actuel incorrect");

  if (!newPassword || newPassword.length < 8) {
    throw new AppError("PASSWORD_TOO_SHORT", "Le nouveau mot de passe doit contenir au moins 8 caractères");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  // Incrémente tokenVersion : tous les tokens existants (y compris celui de l'appareil) sont invalidés.
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  return { success: true };
}

/**
 * Réinitialisation par un administrateur (aucun OTP/e-mail dans cette version :
 * l'utilisateur contacte l'admin, qui lui fixe un nouveau mot de passe qu'il
 * communique ensuite hors application).
 */
export async function adminResetPassword(userId: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError("PASSWORD_TOO_SHORT", "Le nouveau mot de passe doit contenir au moins 8 caractères");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  return { success: true };
}
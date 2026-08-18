import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../../db/client";
import { signToken } from "../../middleware/auth";

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // ex: "A1B2C3D4"
}

// Verrouillage par numéro de téléphone : protège même contre une attaque
// distribuée sur plusieurs IP (que le rate-limit par IP ne couvre pas).
// En mémoire — suffisant pour un cercle privé sur un seul serveur ; à passer
// sur Redis si un jour plusieurs instances tournent en parallèle.
const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const attemptsByPhone = new Map<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>();

function checkLock(phone: string) {
  const entry = attemptsByPhone.get(phone);
  if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    throw new Error(`Trop de tentatives échouées. Réessaie dans ${minutesLeft} min.`);
  }
}

function registerFailedAttempt(phone: string) {
  const now = Date.now();
  const entry = attemptsByPhone.get(phone);
  if (!entry || now - entry.firstAttemptAt > LOCK_WINDOW_MS) {
    attemptsByPhone.set(phone, { count: 1, firstAttemptAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_WINDOW_MS;
  }
}

function clearAttempts(phone: string) {
  attemptsByPhone.delete(phone);
}

export async function register(name: string, phone: string, password: string, referralCode?: string) {
  const passwordHash = await bcrypt.hash(password, 10);

  let referredById: string | undefined;
  if (referralCode) {
    const sponsor = await prisma.user.findUnique({ where: { referralCode } });
    if (!sponsor) throw new Error("Code de parrainage invalide");
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

  await prisma.message.create({
    data: { clientId, senderId: admin.id, senderRole: "ADMIN", text },
  });
}


export async function login(phone: string, password: string) {
  checkLock(phone);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    registerFailedAttempt(phone);
    throw new Error("Numéro ou mot de passe incorrect");
  }

  if (user.anonymizedAt) {
    registerFailedAttempt(phone);
    throw new Error("Numéro ou mot de passe incorrect");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    registerFailedAttempt(phone);
    throw new Error("Numéro ou mot de passe incorrect");
  }

  clearAttempts(phone);

  // Un compte PENDING peut désormais se connecter (accès restreint géré côté
  // client + côté demande d'aide), pour que le client voie tout de suite son
  // tableau de bord après inscription. Seul un compte SUSPENDED reste bloqué.
  if (user.status === "SUSPENDED") {
    throw new Error("Compte suspendu. Contacte un administrateur.");
  }

  const token = signToken({ userId: user.id, role: user.role });
  return { token, user: { id: user.id, name: user.name, role: user.role, status: user.status } };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Mot de passe actuel incorrect");

  if (!newPassword || newPassword.length < 6) {
    throw new Error("Le nouveau mot de passe doit contenir au moins 6 caractères");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { success: true };
}

/**
 * Réinitialisation par un administrateur (aucun OTP/e-mail dans cette version :
 * l'utilisateur contacte l'admin, qui lui fixe un nouveau mot de passe qu'il
 * communique ensuite hors application).
 */
export async function adminResetPassword(userId: string, newPassword: string) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Le nouveau mot de passe doit contenir au moins 6 caractères");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { success: true };
}
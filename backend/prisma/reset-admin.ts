/**
 * Récupération de l'accès administrateur. À lancer depuis un poste de confiance,
 * avec DATABASE_URL pointant vers la base.
 *
 * Un seul administrateur en base (cas le plus fréquent) :
 *   RESET_ADMIN_ONLY=1 RESET_ADMIN_PASSWORD=<8 caractères min> \
 *   [RESET_ADMIN_NEW_PHONE=<numéro>] npx tsx prisma/reset-admin.ts
 *
 * Plusieurs administrateurs : indiquer le numéro actuel avec RESET_ADMIN_PHONE.
 *
 * Le numéro est enregistré sous sa forme canonique (ex. 077000000). Le script
 * vérifie à la fin que le numéro et le mot de passe correspondent bien à la base.
 * Le mot de passe n'est jamais affiché. Retire RESET_ADMIN_PASSWORD ensuite.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { normalizePhone, canonicalStoredPhone } from "../src/validation/phone";

const prisma = new PrismaClient();

function mask(phone: string): string {
  return phone.length <= 4 ? "****" : `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

async function main() {
  const password = process.env.RESET_ADMIN_PASSWORD ?? "";
  const onlyOne = process.env.RESET_ADMIN_ONLY === "1";
  const wantedPhone = normalizePhone(process.env.RESET_ADMIN_PHONE ?? "");
  const newPhoneInput = (process.env.RESET_ADMIN_NEW_PHONE ?? "").trim();

  if (password.length < 8) {
    console.error("RESET_ADMIN_PASSWORD est requis (8 caractères minimum).");
    process.exitCode = 1;
    return;
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, phone: true, name: true, status: true },
  });

  let target: (typeof admins)[number] | undefined;
  if (onlyOne) {
    if (admins.length !== 1) {
      console.error(`RESET_ADMIN_ONLY=1 demande exactement un administrateur, ${admins.length} trouvé(s). Utilise RESET_ADMIN_PHONE.`);
      process.exitCode = 1;
      return;
    }
    target = admins[0];
  } else {
    if (!wantedPhone) {
      console.error("Indique RESET_ADMIN_ONLY=1 (un seul admin) ou RESET_ADMIN_PHONE (numéro actuel).");
      process.exitCode = 1;
      return;
    }
    target = admins.find((a) => canonicalStoredPhone(a.phone) === wantedPhone);
  }

  if (!target) {
    console.error("Aucun administrateur ne correspond. Administrateurs existants (masqués) :");
    for (const a of admins) console.error(`  - ${mask(canonicalStoredPhone(a.phone))}`);
    process.exitCode = 1;
    return;
  }

  const newPhone = newPhoneInput ? normalizePhone(newPhoneInput) : canonicalStoredPhone(target.phone);
  if (newPhone.replace(/\D/g, "").length < 6) {
    console.error("Le numéro fourni est invalide.");
    process.exitCode = 1;
    return;
  }

  // Le numéro ne doit pas appartenir à un autre compte
  const others = await prisma.user.findMany({
    where: { anonymizedAt: null, NOT: { id: target.id } },
    select: { id: true, phone: true },
  });
  if (others.some((u) => canonicalStoredPhone(u.phone) === newPhone)) {
    console.error("Ce numéro est déjà utilisé par un autre compte. Opération annulée.");
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: target.id },
    // Un administrateur seul en base est aussi super-administrateur (il doit pouvoir gérer les admins).
    data: { passwordHash, status: "ACTIVE", phone: newPhone, tokenVersion: { increment: 1 }, ...(onlyOne ? { isSuperAdmin: true } : {}) },
  });

  // Déverrouillage : efface les tentatives ratées de l'ancien et du nouveau numéro.
  const cleared = await prisma.loginAttempt.deleteMany({
    where: { phone: { in: [canonicalStoredPhone(target.phone), newPhone] } },
  });
  console.log(`Verrouillage levé : ${cleared.count} entrée(s) effacée(s).`);

  // Vérification : exactement ce que fait la connexion
  const check = await prisma.user.findUnique({ where: { id: target.id } });
  const phoneOk = !!check && canonicalStoredPhone(check.phone) === newPhone;
  const passwordOk = !!check && (await bcrypt.compare(password, check.passwordHash));
  if (phoneOk && passwordOk) {
    console.log(`OK : connexion possible avec ${mask(newPhone)} et le mot de passe fourni.`);
  } else {
    console.error(`Vérification échouée (numéro ${phoneOk ? "ok" : "KO"}, mot de passe ${passwordOk ? "ok" : "KO"}).`);
    process.exitCode = 1;
  }
  console.log("Retire maintenant RESET_ADMIN_PASSWORD de l'environnement.");
}

main()
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

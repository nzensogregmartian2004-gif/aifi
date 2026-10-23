/**
 * État des comptes administrateurs. LECTURE SEULE : ne teste aucun mot de passe,
 * ne modifie rien. Sert à savoir quel compte existe, s'il a un mot de passe, et
 * si le numéro est temporairement verrouillé (et pour combien de temps).
 *
 *   DATABASE_URL="<URL externe de la base>" npx tsx prisma/admin-status.ts
 */
import { PrismaClient } from "@prisma/client";
import { canonicalStoredPhone } from "../src/validation/phone";

const prisma = new PrismaClient();

function mask(phone: string): string {
  return phone.length <= 4 ? "****" : `${phone.slice(0, 3)}${"*".repeat(Math.max(0, phone.length - 5))}${phone.slice(-2)}`;
}

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, phone: true, status: true, passwordHash: true,
      isSuperAdmin: true, lastSeenAt: true, createdAt: true, anonymizedAt: true,
    },
  });

  if (admins.length === 0) {
    console.log("Aucun compte administrateur en base.");
    console.log("Crée-le avec reset-admin.ts (RESET_ADMIN_ONLY=1 ou RESET_ADMIN_PHONE).");
    return;
  }

  const phones = admins.map((a) => canonicalStoredPhone(a.phone));
  const attempts = await prisma.loginAttempt.findMany({ where: { phone: { in: phones } } });
  const now = Date.now();

  console.log(`Comptes administrateurs : ${admins.length}\n`);
  admins.forEach((a, i) => {
    const phone = canonicalStoredPhone(a.phone);
    const att = attempts.find((x) => x.phone === phone);
    const remaining = att?.lockedUntil && att.lockedUntil.getTime() > now
      ? Math.ceil((att.lockedUntil.getTime() - now) / 60000)
      : 0;
    console.log(`#${i + 1} ${a.name}`);
    console.log(`   numéro           : ${mask(phone)}  (${phone.length} chiffres)`);
    console.log(`   statut           : ${a.status}${a.anonymizedAt ? " (ANONYMISÉ)" : ""}`);
    console.log(`   super-admin      : ${a.isSuperAdmin ? "oui" : "non"}`);
    console.log(`   mot de passe     : ${a.passwordHash ? "défini" : "ABSENT"}`);
    console.log(`   dernière activité: ${a.lastSeenAt ? a.lastSeenAt.toLocaleString("fr-FR") : "jamais"}`);
    console.log(`   tentatives ratées: ${att?.count ?? 0}`);
    console.log(`   verrouillé       : ${remaining > 0 ? `oui, encore ${remaining} min` : "non"}\n`);
  });
  console.log("Pour réinitialiser (efface aussi le verrouillage) : reset-admin.ts");
}

main()
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

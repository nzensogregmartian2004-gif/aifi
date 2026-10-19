/**
 * Réinitialise le mot de passe du compte administrateur existant.
 * À lancer UNE FOIS depuis le shell Render, puis supprimer les variables RESET_ADMIN_*.
 *
 *   RESET_ADMIN_PHONE=<téléphone admin> RESET_ADMIN_PASSWORD=<nouveau, 8 car. min> \
 *     npx tsx prisma/reset-admin.ts
 *
 * Le mot de passe n'est jamais affiché. Les anciens tokens admin sont invalidés.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Mêmes formes que la connexion (voir auth.controller.ts).
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

function mask(phone: string): string {
  return phone.length <= 4 ? "****" : `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

async function main() {
  const phone = (process.env.RESET_ADMIN_PHONE ?? "").replace(/[^\d+]/g, "");
  const password = process.env.RESET_ADMIN_PASSWORD ?? "";
  if (!phone || password.length < 8) {
    console.error("RESET_ADMIN_PHONE et RESET_ADMIN_PASSWORD (8 caractères minimum) sont requis.");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findFirst({
    where: { role: "ADMIN", phone: { in: phoneCandidates(phone) } },
  });

  if (!user) {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { phone: true } });
    console.error(`Aucun administrateur trouvé pour ${mask(phone)}.`);
    console.error(`Administrateurs existants (masqués) : ${admins.map((a) => mask(a.phone)).join(", ") || "aucun"}`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: "ACTIVE", tokenVersion: { increment: 1 } },
  });
  console.log(`Mot de passe réinitialisé pour l'administrateur ${mask(user.phone)}. Supprime maintenant RESET_ADMIN_PASSWORD.`);
}

main()
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

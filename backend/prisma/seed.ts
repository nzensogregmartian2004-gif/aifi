import { normalizePhone } from "../src/validation/phone";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Pas de valeurs par défaut : le compte admin n'est créé que si les deux variables sont définies.
const ADMIN_PHONE = normalizePhone(process.env.SEED_ADMIN_PHONE ?? "");
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Administrateur";

const DEFAULT_TIERS = [
  { minPoints: 0,   ceiling: 0 },
  { minPoints: 10,  ceiling: 1000 },
  { minPoints: 20,  ceiling: 2000 },
  { minPoints: 30,  ceiling: 2000 },
  { minPoints: 50,  ceiling: 5000 },
  { minPoints: 100, ceiling: 10000 },
  { minPoints: 150, ceiling: 15000 },
  { minPoints: 180, ceiling: 25000 },
  { minPoints: 210, ceiling: 50000 },
  { minPoints: 240, ceiling: 60000 },
];

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  for (const tier of DEFAULT_TIERS) {
    await prisma.ceilingTier.upsert({
      where: { minPoints: tier.minPoints },
      update: { ceiling: tier.ceiling },
      create: tier,
    });
  }

  // La grille de durées de remboursement (DurationTier) est déjà initialisée
  // par sa migration (20260822093000_duration_tiers_grid).

  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) {
    console.log("Un compte administrateur existe déjà, aucun nouveau compte créé.");
  } else if (!ADMIN_PHONE || ADMIN_PASSWORD.length < 8) {
    console.warn("Aucun administrateur : définis SEED_ADMIN_PHONE et SEED_ADMIN_PASSWORD (8 caractères min) pour le créer.");
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await prisma.user.create({
      data: {
        name: ADMIN_NAME,
        phone: ADMIN_PHONE,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        referralCode: "ADMIN0000",
      },
    });
    // Le mot de passe n'est jamais affiché dans les logs.
    console.log("Compte administrateur créé à partir de SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD.");
  }

  console.log("Seed terminé : AppSettings, CeilingTier initialisés.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

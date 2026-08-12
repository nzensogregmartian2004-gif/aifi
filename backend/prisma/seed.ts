import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE || "0000000000";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin1234";
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

const DEFAULT_DURATIONS = [7, 15, 30];

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

  for (const days of DEFAULT_DURATIONS) {
    await prisma.allowedDuration.upsert({
      where: { days },
      update: {},
      create: { days },
    });
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!existingAdmin) {
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
    console.log(`Compte administrateur créé — téléphone: ${ADMIN_PHONE} / mot de passe: ${ADMIN_PASSWORD}`);
    console.log("Change ce mot de passe dès que possible (ou définis SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD avant de seed).");
  } else {
    console.log("Un compte administrateur existe déjà, aucun nouveau compte créé.");
  }

  console.log("Seed terminé : AppSettings, CeilingTier, AllowedDuration initialisés.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
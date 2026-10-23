/**
 * Remet au format canonique les numéros déjà stockés. Par défaut : simulation,
 * aucune écriture.
 *
 *   npx tsx prisma/fix-phones.ts            → affiche ce qui changerait
 *   APPLY=1 npx tsx prisma/fix-phones.ts    → applique les changements
 *
 * Un compte n'est modifié que si son nouveau numéro n'appartient à aucun autre
 * compte. Les conflits sont listés pour arbitrage manuel. Numéros masqués à l'affichage.
 */
import { PrismaClient } from "@prisma/client";
import { canonicalStoredPhone } from "../src/validation/phone";

const prisma = new PrismaClient();

function mask(phone: string): string {
  return phone.length <= 4 ? "****" : `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

async function main() {
  const apply = process.env.APPLY === "1";
  const users = await prisma.user.findMany({
    where: { anonymizedAt: null },
    select: { id: true, name: true, phone: true, role: true },
  });

  // Combien de comptes arriveraient sur chaque forme canonique
  const arrivals = new Map<string, number>();
  for (const u of users) {
    const c = canonicalStoredPhone(u.phone);
    arrivals.set(c, (arrivals.get(c) ?? 0) + 1);
  }
  const storedValues = new Map(users.map((u) => [u.phone, u.id]));

  const changes: { id: string; from: string; to: string; role: string }[] = [];
  const conflicts: { from: string; to: string; reason: string }[] = [];

  for (const u of users) {
    const to = canonicalStoredPhone(u.phone);
    if (to === u.phone) continue;
    if ((arrivals.get(to) ?? 0) > 1) {
      conflicts.push({ from: u.phone, to, reason: "deux comptes donneraient le même numéro" });
      continue;
    }
    const owner = storedValues.get(to);
    if (owner && owner !== u.id) {
      conflicts.push({ from: u.phone, to, reason: "numéro déjà utilisé par un autre compte" });
      continue;
    }
    changes.push({ id: u.id, from: u.phone, to, role: u.role });
  }

  console.log(`Comptes analysés : ${users.length}`);
  console.log(`À corriger       : ${changes.length}`);
  console.log(`Conflits         : ${conflicts.length}`);
  for (const c of changes) console.log(`  [${c.role}] ${mask(c.from)} -> ${mask(c.to)}`);
  for (const c of conflicts) console.log(`  CONFLIT ${mask(c.from)} -> ${mask(c.to)} : ${c.reason}`);

  if (!apply) {
    console.log("\nSimulation : rien n'a été modifié. Relance avec APPLY=1 pour appliquer.");
    return;
  }

  for (const c of changes) {
    await prisma.user.update({ where: { id: c.id }, data: { phone: c.to } });
  }
  console.log(`\n${changes.length} numéro(s) corrigé(s).`);
}

main()
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

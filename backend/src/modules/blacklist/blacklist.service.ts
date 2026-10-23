import { AppError } from "../../errors";
import { prisma } from "../../db/client";

export function canonicalPhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("+241")) p = "0" + p.slice(4);
  else if (/^241\d{8}$/.test(p)) p = "0" + p.slice(3);
  return p;
}

export function phoneVariants(raw: string): string[] {
  const c = canonicalPhone(raw);
  const set = new Set([raw.replace(/[^\d+]/g, ""), c]);
  if (c.startsWith("0")) {
    const local = c.slice(1);
    set.add(`+241${local}`);
    set.add(`00241${local}`);
    set.add(`241${local}`);
  }
  return [...set];
}

/** Nom normalisé : sans accents, minuscules, mots triés (ordre prénom/nom indifférent). */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** Ressemblance entre 0 et 1 (1 = identique). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export async function isPhoneBlacklisted(phone: string): Promise<boolean> {
  const hit = await prisma.blacklistEntry.findFirst({
    where: { removedAt: null, phone: { in: phoneVariants(phone) } },
    select: { id: true },
  });
  return !!hit;
}

/** Empreintes SHA-256 des fichiers envoyés (calculées à l'envoi). */
export async function hashesForUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];
  const rows = await prisma.upload.findMany({ where: { url: { in: urls } }, select: { sha256: true } });
  return rows.map((r) => r.sha256).filter((h): h is string => !!h);
}

/**
 * Contrôles d'un dossier d'identité.
 * - Pièce présente en liste noire : dossier refusé (message neutre).
 * - Pièce déjà utilisée par un autre compte, nom proche d'une entrée, téléphone en liste : signalements pour l'admin.
 */
export async function checkVerification(userId: string, urls: string[]): Promise<string[]> {
  const flags: string[] = [];
  const hashes = await hashesForUrls(urls);

  if (hashes.length > 0) {
    const blacklisted = await prisma.blacklistEntry.findFirst({
      where: { removedAt: null, documentHashes: { hasSome: hashes } },
      select: { id: true },
    });
    if (blacklisted) {
      throw new AppError("ACCOUNT_BLOCKED", "Ce dossier ne peut pas être traité. Contacte le support.");
    }
    const sameDocument = await prisma.upload.findFirst({
      where: { sha256: { in: hashes }, ownerId: { not: userId } },
      select: { id: true },
    });
    if (sameDocument) flags.push("PIECE_UTILISEE_PAR_UN_AUTRE_COMPTE");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true } });
  const key = nameKey(user.name);
  const entries = await prisma.blacklistEntry.findMany({
    where: { removedAt: null, nameKey: { not: null } },
    select: { nameKey: true },
  });
  if (entries.some((e) => similarity(key, e.nameKey!) >= 0.85)) {
    flags.push("NOM_PROCHE_D_UNE_ENTREE_LISTE_NOIRE");
  }
  if (await isPhoneBlacklisted(user.phone)) {
    flags.push("TELEPHONE_EN_LISTE_NOIRE");
  }
  return flags;
}

/** Ajoute un client à la liste noire, avec ses empreintes de pièces (documents conservés). */
export async function blacklistUser(userId: string, reason: string, source: "AUTO_BLOCK" | "ADMIN") {
  const existing = await prisma.blacklistEntry.findFirst({ where: { userId, removedAt: null }, select: { id: true } });
  if (existing) return existing;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true } });
  const verification = await prisma.identityVerification.findUnique({
    where: { userId },
    select: { frontUrl: true, backUrl: true, extraUrls: true },
  });
  const urls = verification
    ? [verification.frontUrl, verification.backUrl, ...verification.extraUrls].filter((u): u is string => !!u)
    : [];
  const documentHashes = await hashesForUrls(urls);

  return prisma.blacklistEntry.create({
    data: {
      phone: canonicalPhone(user.phone),
      nameKey: nameKey(user.name),
      documentHashes,
      reason,
      source,
      userId,
    },
  });
}

export async function addManualEntry(phone: string, reason: string) {
  return prisma.blacklistEntry.create({
    data: { phone: canonicalPhone(phone), reason, source: "ADMIN" },
  });
}

export async function removeEntry(id: string, reason: string) {
  return prisma.blacklistEntry.update({
    where: { id },
    data: { removedAt: new Date(), removedReason: reason },
  });
}

export async function listEntries() {
  return prisma.blacklistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

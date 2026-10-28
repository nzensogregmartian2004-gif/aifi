import { describe, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import {
  createAdmin,
  setSuperAdmin,
  setAdminStatus,
  resetAdminPassword,
  listAdmins,
} from "./admin-team.service";
import { errorBody } from "../../errors";

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    const value = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("notIn" in cond) return !cond.notIn.includes(value);
      throw new Error(`opérateur non géré : ${Object.keys(cond).join(",")}`);
    }
    return value === cond;
  });
}

const byId = (rows: Row[], id: string): Row => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`ligne introuvable : ${id}`);
  return found;
};

function makeDb(seed: { users?: Row[]; blacklist?: Row[] } = {}) {
  const users: Row[] = (seed.users ?? []).map((u) => ({ tokenVersion: 0, createdAt: new Date(), ...u }));
  const blacklist: Row[] = seed.blacklist ?? [];
  const audits: Row[] = [];
  const db: any = {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => matches(u, where)) ?? null,
      findMany: async ({ where }: any = {}) => users.filter((u) => matches(u, where)),
      count: async ({ where }: any = {}) => users.filter((u) => matches(u, where)).length,
      create: async ({ data }: any) => {
        const row = { id: `u${users.length + 1}`, createdAt: new Date(), tokenVersion: 0, ...data };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error("utilisateur introuvable");
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as any)) u[k] = (u[k] ?? 0) + (v as any).increment;
          else u[k] = v;
        }
        return u;
      },
    },
    blacklistEntry: { findFirst: async ({ where }: any) => blacklist.find((b) => matches(b, where)) ?? null },
    auditLog: { create: async ({ data }: any) => (audits.push(data), data) },
    // Garde-fous : créer un administrateur ne doit JAMAIS envoyer de message ni de notification
    message: { create: async () => { throw new Error("aucun message ne doit être créé pour un administrateur"); } },
    notification: { create: async () => { throw new Error("aucune notification ne doit être créée pour un administrateur"); } },
  };
  return { db, users, audits };
}

const superA1 = { id: "a1", role: "ADMIN", status: "ACTIVE", isSuperAdmin: true, name: "Super" };
const adminA2 = { id: "a2", role: "ADMIN", status: "ACTIVE", isSuperAdmin: false, name: "Awa" };
const client = { id: "c1", role: "CLIENT", status: "ACTIVE", isSuperAdmin: false, name: "Client" };

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: any) => err?.code === code, `attendu : ${code}`);
}

describe("création d'un administrateur", () => {
  test("crée un compte ADMIN actif, sans droit super, et journalise l'action", async () => {
    const { db, users, audits } = makeDb({ users: [superA1] });
    const created = await createAdmin("a1", { name: "Awa", phone: "077123456", password: "motdepasse1" }, db);
    const row = byId(users, created.id);
    assert.equal(row.role, "ADMIN");
    assert.equal(row.status, "ACTIVE");
    assert.equal(row.isSuperAdmin, false);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "admin_created");
  });
  test("le mot de passe est haché, jamais stocké en clair", async () => {
    const { db, users } = makeDb({ users: [superA1] });
    const created = await createAdmin("a1", { name: "Awa", phone: "077123456", password: "motdepasse1" }, db);
    const row = byId(users, created.id);
    assert.notEqual(row.passwordHash, "motdepasse1");
    assert.equal(await bcrypt.compare("motdepasse1", row.passwordHash), true);
  });
  test("numéro déjà utilisé refusé avec un code clair", async () => {
    const { db } = makeDb({ users: [superA1, { ...client, phone: "077123456" }] });
    await expectCode(createAdmin("a1", { name: "Awa", phone: "077123456", password: "motdepasse1" }, db), "PHONE_ALREADY_USED");
  });
  test("numéro sur la liste noire refusé", async () => {
    const { db } = makeDb({ users: [superA1], blacklist: [{ id: "b1", phone: "077999999", removedAt: null }] });
    await expectCode(createAdmin("a1", { name: "Awa", phone: "077999999", password: "motdepasse1" }, db), "PHONE_BLACKLISTED");
  });
  test("mot de passe trop court refusé", async () => {
    const { db } = makeDb({ users: [superA1] });
    await expectCode(createAdmin("a1", { name: "Awa", phone: "077123456", password: "court" }, db), "PASSWORD_TOO_SHORT");
  });
});

describe("super administrateur : accorder, retirer, garde-fous", () => {
  test("on ne peut pas modifier ses propres droits", async () => {
    const { db } = makeDb({ users: [superA1, adminA2] });
    await expectCode(setSuperAdmin("a1", "a1", false, db), "SELF_ACTION_FORBIDDEN");
  });
  test("accorder le statut super à un administrateur", async () => {
    const { db, users } = makeDb({ users: [superA1, adminA2] });
    await setSuperAdmin("a1", "a2", true, db);
    assert.equal(byId(users, "a2").isSuperAdmin, true);
  });
  test("retirer le statut super est possible tant qu'un autre super actif existe", async () => {
    const { db, users } = makeDb({ users: [superA1, { ...adminA2, isSuperAdmin: true }] });
    await setSuperAdmin("a1", "a2", false, db);
    assert.equal(byId(users, "a2").isSuperAdmin, false);
  });
  test("impossible de retirer le dernier super administrateur actif", async () => {
    const { db } = makeDb({ users: [superA1, adminA2] });
    await expectCode(setSuperAdmin("a2", "a1", false, db), "LAST_SUPER_ADMIN");
  });
  test("un compte qui n'est pas administrateur ne peut pas recevoir ce statut", async () => {
    const { db } = makeDb({ users: [superA1, client] });
    await expectCode(setSuperAdmin("a1", "c1", true, db), "NOT_AN_ADMIN");
  });
});

describe("suspension et réactivation", () => {
  test("on ne peut pas suspendre son propre compte", async () => {
    const { db } = makeDb({ users: [superA1, adminA2] });
    await expectCode(setAdminStatus("a1", "a1", "SUSPENDED", db), "SELF_ACTION_FORBIDDEN");
  });
  test("suspendre un administrateur révoque ses sessions (tokenVersion incrémenté)", async () => {
    const { db, users } = makeDb({ users: [superA1, adminA2] });
    await setAdminStatus("a1", "a2", "SUSPENDED", db);
    const row = byId(users, "a2");
    assert.equal(row.status, "SUSPENDED");
    assert.equal(row.tokenVersion, 1);
  });
  test("réactiver rétablit le compte", async () => {
    const { db, users } = makeDb({ users: [superA1, { ...adminA2, status: "SUSPENDED" }] });
    await setAdminStatus("a1", "a2", "ACTIVE", db);
    assert.equal(byId(users, "a2").status, "ACTIVE");
  });
  test("impossible de suspendre le dernier super administrateur actif", async () => {
    const { db } = makeDb({ users: [superA1, adminA2] });
    await expectCode(setAdminStatus("a2", "a1", "SUSPENDED", db), "LAST_SUPER_ADMIN");
  });
  test("suspendre un super administrateur reste possible s'il en reste un autre actif", async () => {
    const { db, users } = makeDb({ users: [superA1, { ...adminA2, isSuperAdmin: true }] });
    await setAdminStatus("a2", "a1", "SUSPENDED", db);
    assert.equal(byId(users, "a1").status, "SUSPENDED");
  });
});

describe("réinitialisation du mot de passe d'un administrateur", () => {
  test("le nouveau mot de passe fonctionne, l'ancien session est révoquée", async () => {
    const { db, users } = makeDb({ users: [superA1, { ...adminA2, passwordHash: "ancien" }] });
    await resetAdminPassword("a1", "a2", "nouveau-mdp-1", db);
    const row = byId(users, "a2");
    assert.equal(await bcrypt.compare("nouveau-mdp-1", row.passwordHash), true);
    assert.equal(row.tokenVersion, 1);
  });
  test("pas de réinitialisation de son propre mot de passe depuis l'espace admin", async () => {
    const { db } = makeDb({ users: [superA1] });
    await expectCode(resetAdminPassword("a1", "a1", "nouveau-mdp-1", db), "SELF_ACTION_FORBIDDEN");
  });
  test("mot de passe trop court refusé", async () => {
    const { db } = makeDb({ users: [superA1, adminA2] });
    await expectCode(resetAdminPassword("a1", "a2", "court", db), "PASSWORD_TOO_SHORT");
  });
});

describe("liste des administrateurs", () => {
  test("ne renvoie que les administrateurs, avec le statut super", async () => {
    const { db } = makeDb({ users: [superA1, adminA2, client] });
    const list = await listAdmins(db);
    assert.deepEqual(list.map((a: any) => a.id).sort(), ["a1", "a2"]);
    assert.equal(list.find((a: any) => a.id === "a1").isSuperAdmin, true);
  });
});

describe("messages d'erreur renvoyés à l'application", () => {
  test("une erreur Prisma ne montre jamais le texte technique", () => {
    class PrismaClientValidationError extends Error {}
    const body = errorBody(new PrismaClientValidationError("Invalid `prisma.user.create()` invocation: ..."));
    assert.equal(body.code, "DB_ERROR");
    assert.ok(!body.error.includes("prisma"));
  });
  test("une contrainte unique devient un message lisible", () => {
    const body = errorBody({ code: "P2002", message: "Unique constraint failed on the fields: (`phone`)" });
    assert.equal(body.code, "DUPLICATE");
  });
  test("une erreur métier garde son code et son message", () => {
    const body = errorBody({ code: "LAST_SUPER_ADMIN", message: "Il doit toujours rester au moins un super administrateur actif." });
    assert.equal(body.code, "LAST_SUPER_ADMIN");
  });
});

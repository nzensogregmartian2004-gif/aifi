"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const admin_team_service_1 = require("./admin-team.service");
const errors_1 = require("../../errors");
function matches(row, where = {}) {
    return Object.entries(where).every(([key, cond]) => {
        if (cond === undefined)
            return true;
        const value = row[key];
        if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
            if ("in" in cond)
                return cond.in.includes(value);
            if ("notIn" in cond)
                return !cond.notIn.includes(value);
            throw new Error(`opérateur non géré : ${Object.keys(cond).join(",")}`);
        }
        return value === cond;
    });
}
const byId = (rows, id) => {
    const found = rows.find((r) => r.id === id);
    if (!found)
        throw new Error(`ligne introuvable : ${id}`);
    return found;
};
function makeDb(seed = {}) {
    const users = (seed.users ?? []).map((u) => ({ tokenVersion: 0, createdAt: new Date(), ...u }));
    const blacklist = seed.blacklist ?? [];
    const audits = [];
    const db = {
        user: {
            findUnique: async ({ where }) => users.find((u) => matches(u, where)) ?? null,
            findMany: async ({ where } = {}) => users.filter((u) => matches(u, where)),
            count: async ({ where } = {}) => users.filter((u) => matches(u, where)).length,
            create: async ({ data }) => {
                const row = { id: `u${users.length + 1}`, createdAt: new Date(), tokenVersion: 0, ...data };
                users.push(row);
                return row;
            },
            update: async ({ where, data }) => {
                const u = users.find((x) => x.id === where.id);
                if (!u)
                    throw new Error("utilisateur introuvable");
                for (const [k, v] of Object.entries(data)) {
                    if (v && typeof v === "object" && "increment" in v)
                        u[k] = (u[k] ?? 0) + v.increment;
                    else
                        u[k] = v;
                }
                return u;
            },
        },
        blacklistEntry: { findFirst: async ({ where }) => blacklist.find((b) => matches(b, where)) ?? null },
        auditLog: { create: async ({ data }) => (audits.push(data), data) },
        // Garde-fous : créer un administrateur ne doit JAMAIS envoyer de message ni de notification
        message: { create: async () => { throw new Error("aucun message ne doit être créé pour un administrateur"); } },
        notification: { create: async () => { throw new Error("aucune notification ne doit être créée pour un administrateur"); } },
    };
    return { db, users, audits };
}
const superA1 = { id: "a1", role: "ADMIN", status: "ACTIVE", isSuperAdmin: true, name: "Super" };
const adminA2 = { id: "a2", role: "ADMIN", status: "ACTIVE", isSuperAdmin: false, name: "Awa" };
const client = { id: "c1", role: "CLIENT", status: "ACTIVE", isSuperAdmin: false, name: "Client" };
async function expectCode(promise, code) {
    await strict_1.default.rejects(promise, (err) => err?.code === code, `attendu : ${code}`);
}
(0, node_test_1.describe)("création d'un administrateur", () => {
    (0, node_test_1.test)("crée un compte ADMIN actif, sans droit super, et journalise l'action", async () => {
        const { db, users, audits } = makeDb({ users: [superA1] });
        const created = await (0, admin_team_service_1.createAdmin)("a1", { name: "Awa", phone: "077123456", password: "motdepasse1" }, db);
        const row = byId(users, created.id);
        strict_1.default.equal(row.role, "ADMIN");
        strict_1.default.equal(row.status, "ACTIVE");
        strict_1.default.equal(row.isSuperAdmin, false);
        strict_1.default.equal(audits.length, 1);
        strict_1.default.equal(audits[0].action, "admin_created");
    });
    (0, node_test_1.test)("le mot de passe est haché, jamais stocké en clair", async () => {
        const { db, users } = makeDb({ users: [superA1] });
        const created = await (0, admin_team_service_1.createAdmin)("a1", { name: "Awa", phone: "077123456", password: "motdepasse1" }, db);
        const row = byId(users, created.id);
        strict_1.default.notEqual(row.passwordHash, "motdepasse1");
        strict_1.default.equal(await bcrypt_1.default.compare("motdepasse1", row.passwordHash), true);
    });
    (0, node_test_1.test)("numéro déjà utilisé refusé avec un code clair", async () => {
        const { db } = makeDb({ users: [superA1, { ...client, phone: "077123456" }] });
        const err = await (0, admin_team_service_1.createAdmin)("a1", { name: "Awa", phone: "077123456", password: "motdepasse1" }, db).then(() => null, (e) => e);
        strict_1.default.equal(err?.code, "PHONE_TAKEN_BY_CLIENT");
        strict_1.default.ok(err.message.includes("client") && err.message.includes("Client"), "le message doit dire quel compte libérer");
    });
    (0, node_test_1.test)("numéro sur la liste noire refusé", async () => {
        const { db } = makeDb({ users: [superA1], blacklist: [{ id: "b1", phone: "077999999", removedAt: null }] });
        await expectCode((0, admin_team_service_1.createAdmin)("a1", { name: "Awa", phone: "077999999", password: "motdepasse1" }, db), "PHONE_BLACKLISTED");
    });
    (0, node_test_1.test)("mot de passe trop court refusé", async () => {
        const { db } = makeDb({ users: [superA1] });
        await expectCode((0, admin_team_service_1.createAdmin)("a1", { name: "Awa", phone: "077123456", password: "court" }, db), "PASSWORD_TOO_SHORT");
    });
});
(0, node_test_1.describe)("super administrateur : accorder, retirer, garde-fous", () => {
    (0, node_test_1.test)("on ne peut pas modifier ses propres droits", async () => {
        const { db } = makeDb({ users: [superA1, adminA2] });
        await expectCode((0, admin_team_service_1.setSuperAdmin)("a1", "a1", false, db), "SELF_ACTION_FORBIDDEN");
    });
    (0, node_test_1.test)("accorder le statut super à un administrateur", async () => {
        const { db, users } = makeDb({ users: [superA1, adminA2] });
        await (0, admin_team_service_1.setSuperAdmin)("a1", "a2", true, db);
        strict_1.default.equal(byId(users, "a2").isSuperAdmin, true);
    });
    (0, node_test_1.test)("retirer le statut super est possible tant qu'un autre super actif existe", async () => {
        const { db, users } = makeDb({ users: [superA1, { ...adminA2, isSuperAdmin: true }] });
        await (0, admin_team_service_1.setSuperAdmin)("a1", "a2", false, db);
        strict_1.default.equal(byId(users, "a2").isSuperAdmin, false);
    });
    (0, node_test_1.test)("impossible de retirer le dernier super administrateur actif", async () => {
        const { db } = makeDb({ users: [superA1, adminA2] });
        await expectCode((0, admin_team_service_1.setSuperAdmin)("a2", "a1", false, db), "LAST_SUPER_ADMIN");
    });
    (0, node_test_1.test)("un compte qui n'est pas administrateur ne peut pas recevoir ce statut", async () => {
        const { db } = makeDb({ users: [superA1, client] });
        await expectCode((0, admin_team_service_1.setSuperAdmin)("a1", "c1", true, db), "NOT_AN_ADMIN");
    });
});
(0, node_test_1.describe)("suspension et réactivation", () => {
    (0, node_test_1.test)("on ne peut pas suspendre son propre compte", async () => {
        const { db } = makeDb({ users: [superA1, adminA2] });
        await expectCode((0, admin_team_service_1.setAdminStatus)("a1", "a1", "SUSPENDED", db), "SELF_ACTION_FORBIDDEN");
    });
    (0, node_test_1.test)("suspendre un administrateur révoque ses sessions (tokenVersion incrémenté)", async () => {
        const { db, users } = makeDb({ users: [superA1, adminA2] });
        await (0, admin_team_service_1.setAdminStatus)("a1", "a2", "SUSPENDED", db);
        const row = byId(users, "a2");
        strict_1.default.equal(row.status, "SUSPENDED");
        strict_1.default.equal(row.tokenVersion, 1);
    });
    (0, node_test_1.test)("réactiver rétablit le compte", async () => {
        const { db, users } = makeDb({ users: [superA1, { ...adminA2, status: "SUSPENDED" }] });
        await (0, admin_team_service_1.setAdminStatus)("a1", "a2", "ACTIVE", db);
        strict_1.default.equal(byId(users, "a2").status, "ACTIVE");
    });
    (0, node_test_1.test)("impossible de suspendre le dernier super administrateur actif", async () => {
        const { db } = makeDb({ users: [superA1, adminA2] });
        await expectCode((0, admin_team_service_1.setAdminStatus)("a2", "a1", "SUSPENDED", db), "LAST_SUPER_ADMIN");
    });
    (0, node_test_1.test)("suspendre un super administrateur reste possible s'il en reste un autre actif", async () => {
        const { db, users } = makeDb({ users: [superA1, { ...adminA2, isSuperAdmin: true }] });
        await (0, admin_team_service_1.setAdminStatus)("a2", "a1", "SUSPENDED", db);
        strict_1.default.equal(byId(users, "a1").status, "SUSPENDED");
    });
});
(0, node_test_1.describe)("réinitialisation du mot de passe d'un administrateur", () => {
    (0, node_test_1.test)("le nouveau mot de passe fonctionne, l'ancien session est révoquée", async () => {
        const { db, users } = makeDb({ users: [superA1, { ...adminA2, passwordHash: "ancien" }] });
        await (0, admin_team_service_1.resetAdminPassword)("a1", "a2", "nouveau-mdp-1", db);
        const row = byId(users, "a2");
        strict_1.default.equal(await bcrypt_1.default.compare("nouveau-mdp-1", row.passwordHash), true);
        strict_1.default.equal(row.tokenVersion, 1);
    });
    (0, node_test_1.test)("pas de réinitialisation de son propre mot de passe depuis l'espace admin", async () => {
        const { db } = makeDb({ users: [superA1] });
        await expectCode((0, admin_team_service_1.resetAdminPassword)("a1", "a1", "nouveau-mdp-1", db), "SELF_ACTION_FORBIDDEN");
    });
    (0, node_test_1.test)("mot de passe trop court refusé", async () => {
        const { db } = makeDb({ users: [superA1, adminA2] });
        await expectCode((0, admin_team_service_1.resetAdminPassword)("a1", "a2", "court", db), "PASSWORD_TOO_SHORT");
    });
});
(0, node_test_1.describe)("liste des administrateurs", () => {
    (0, node_test_1.test)("ne renvoie que les administrateurs, avec le statut super", async () => {
        const { db } = makeDb({ users: [superA1, adminA2, client] });
        const list = await (0, admin_team_service_1.listAdmins)(db);
        strict_1.default.deepEqual(list.map((a) => a.id).sort(), ["a1", "a2"]);
        strict_1.default.equal(list.find((a) => a.id === "a1").isSuperAdmin, true);
    });
});
(0, node_test_1.describe)("messages d'erreur renvoyés à l'application", () => {
    (0, node_test_1.test)("une erreur Prisma ne montre jamais le texte technique", () => {
        class PrismaClientValidationError extends Error {
        }
        const body = (0, errors_1.errorBody)(new PrismaClientValidationError("Invalid `prisma.user.create()` invocation: ..."));
        strict_1.default.equal(body.code, "DB_ERROR");
        strict_1.default.ok(!body.error.includes("prisma"));
    });
    (0, node_test_1.test)("une contrainte unique devient un message lisible", () => {
        const body = (0, errors_1.errorBody)({ code: "P2002", message: "Unique constraint failed on the fields: (`phone`)" });
        strict_1.default.equal(body.code, "DUPLICATE");
    });
    (0, node_test_1.test)("une erreur métier garde son code et son message", () => {
        const body = (0, errors_1.errorBody)({ code: "LAST_SUPER_ADMIN", message: "Il doit toujours rester au moins un super administrateur actif." });
        strict_1.default.equal(body.code, "LAST_SUPER_ADMIN");
    });
});

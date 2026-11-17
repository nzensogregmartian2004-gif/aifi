import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "path";

// Base de données simulée : seules les méthodes utilisées par le service sont implémentées.
const users: any[] = [];
const notifications: any[] = [];
const fetched: any[] = [];
const fake: any = {
  user: {
    findUnique: async ({ where, select }: any) => users.find((u) => u.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: any) => users.find((u) => u.id === where.id),
    findMany: async ({ where }: any) => users.filter((u) => (where?.role ? u.role === where.role : true)),
    update: async ({ where, data }: any) => { const u = users.find((x) => x.id === where.id); Object.assign(u, data); return u; },
  },
  notification: {
    create: async ({ data }: any) => { notifications.push(data); return data; },
    createMany: async ({ data }: any) => { notifications.push(...data); return { count: data.length }; },
  },
};
const clientPath = require.resolve(path.resolve("src/db/client.ts"));
(require as any).cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { prisma: fake } };
(globalThis as any).fetch = async (_url: string, opts: any) => {
  fetched.push(JSON.parse(opts.body));
  return { ok: true, status: 200, json: async () => ({ data: { status: "ok" } }) };
};

const svc = () => import(path.resolve("src/modules/notifications/notification.service.ts"));

describe("réglage des notifications push", () => {
  beforeEach(() => {
    users.length = 0; notifications.length = 0; fetched.length = 0;
  });

  test("push désactivé : pas d'envoi, mais la notification reste dans la boîte AIFI", async () => {
    users.push({ id: "c1", name: "Ana", role: "CLIENT", pushToken: "ExponentPushToken[a]", pushEnabled: false, language: "fr" });
    const s: any = await svc();
    await (s.notifyUser ?? s.default.notifyUser)("c1", "account_validated", {});
    assert.equal(fetched.length, 0);
    assert.equal(notifications.length, 1);
  });

  test("push activé : envoi vers le token de l'appareil", async () => {
    users.push({ id: "c2", name: "Bob", role: "CLIENT", pushToken: "ExponentPushToken[b]", pushEnabled: true, language: "fr" });
    const s: any = await svc();
    await (s.notifyUser ?? s.default.notifyUser)("c2", "account_validated", {});
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].to, "ExponentPushToken[b]");
  });

  test("alerte admin : seuls les admins avec push activé reçoivent l'envoi push", async () => {
    users.push(
      { id: "a1", name: "Admin 1", role: "ADMIN", status: "ACTIVE", pushToken: "ExponentPushToken[x]", pushEnabled: false, language: "fr" },
      { id: "a2", name: "Admin 2", role: "ADMIN", status: "ACTIVE", pushToken: "ExponentPushToken[y]", pushEnabled: true, language: "fr" }
    );
    const s: any = await svc();
    await (s.notifyAdmins ?? s.default.notifyAdmins)("admin_client_registered", { name: "Carl" });
    assert.equal(notifications.length, 2, "les deux admins gardent l'historique");
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].to, "ExponentPushToken[y]");
  });

  test("réglage : désactiver puis relire", async () => {
    users.push({ id: "c3", name: "Dora", role: "CLIENT", pushToken: "ExponentPushToken[d]", pushEnabled: true, language: "fr" });
    const s: any = await svc();
    const set = s.setPushEnabled ?? s.default.setPushEnabled;
    const get = s.getNotificationSettings ?? s.default.getNotificationSettings;
    await set("c3", false);
    assert.deepEqual(await get("c3"), { pushEnabled: false, hasPushToken: true, deviceRegistered: true });
  });
});

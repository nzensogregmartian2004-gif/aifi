"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const path_1 = __importDefault(require("path"));
const node_url_1 = require("node:url");
// Base de données simulée : seules les méthodes utilisées par le service sont implémentées.
const users = [];
const notifications = [];
const fetched = [];
const fake = {
    user: {
        findUnique: async ({ where, select }) => users.find((u) => u.id === where.id) ?? null,
        findUniqueOrThrow: async ({ where }) => users.find((u) => u.id === where.id),
        findMany: async ({ where }) => users.filter((u) => (where?.role ? u.role === where.role : true)),
        update: async ({ where, data }) => { const u = users.find((x) => x.id === where.id); Object.assign(u, data); return u; },
    },
    notification: {
        create: async ({ data }) => { notifications.push(data); return data; },
        createMany: async ({ data }) => { notifications.push(...data); return { count: data.length }; },
    },
};
const clientPath = require.resolve(path_1.default.resolve("src/db/client.ts"));
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { prisma: fake } };
globalThis.fetch = async (_url, opts) => {
    fetched.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ data: { status: "ok" } }) };
};
const svc = () => import((0, node_url_1.pathToFileURL)(path_1.default.resolve("src/modules/notifications/notification.service.ts")).href);
(0, node_test_1.describe)("réglage des notifications push", () => {
    (0, node_test_1.beforeEach)(() => {
        users.length = 0;
        notifications.length = 0;
        fetched.length = 0;
    });
    (0, node_test_1.test)("push désactivé : pas d'envoi, mais la notification reste dans la boîte AIFI", async () => {
        users.push({ id: "c1", name: "Ana", role: "CLIENT", pushToken: "ExponentPushToken[a]", pushEnabled: false, language: "fr" });
        const s = await svc();
        await (s.notifyUser ?? s.default.notifyUser)("c1", "account_validated", {});
        strict_1.default.equal(fetched.length, 0);
        strict_1.default.equal(notifications.length, 1);
    });
    (0, node_test_1.test)("push activé : envoi vers le token de l'appareil", async () => {
        users.push({ id: "c2", name: "Bob", role: "CLIENT", pushToken: "ExponentPushToken[b]", pushEnabled: true, language: "fr" });
        const s = await svc();
        await (s.notifyUser ?? s.default.notifyUser)("c2", "account_validated", {});
        strict_1.default.equal(fetched.length, 1);
        strict_1.default.equal(fetched[0].to, "ExponentPushToken[b]");
    });
    (0, node_test_1.test)("alerte admin : seuls les admins avec push activé reçoivent l'envoi push", async () => {
        users.push({ id: "a1", name: "Admin 1", role: "ADMIN", status: "ACTIVE", pushToken: "ExponentPushToken[x]", pushEnabled: false, language: "fr" }, { id: "a2", name: "Admin 2", role: "ADMIN", status: "ACTIVE", pushToken: "ExponentPushToken[y]", pushEnabled: true, language: "fr" });
        const s = await svc();
        await (s.notifyAdmins ?? s.default.notifyAdmins)("admin_client_registered", { name: "Carl" });
        strict_1.default.equal(notifications.length, 2, "les deux admins gardent l'historique");
        strict_1.default.equal(fetched.length, 1);
        strict_1.default.equal(fetched[0].to, "ExponentPushToken[y]");
    });
    (0, node_test_1.test)("réglage : désactiver puis relire", async () => {
        users.push({ id: "c3", name: "Dora", role: "CLIENT", pushToken: "ExponentPushToken[d]", pushEnabled: true, language: "fr" });
        const s = await svc();
        const set = s.setPushEnabled ?? s.default.setPushEnabled;
        const get = s.getNotificationSettings ?? s.default.getNotificationSettings;
        await set("c3", false);
        strict_1.default.deepEqual(await get("c3"), { pushEnabled: false, hasPushToken: true, deviceRegistered: true });
    });
});

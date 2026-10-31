"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const phone_owner_1 = require("./phone-owner");
function makeDb(users, blacklist = []) {
    return {
        user: { findUnique: async ({ where }) => users.find((u) => u.phone === where.phone) ?? null },
        blacklistEntry: {
            findFirst: async ({ where }) => blacklist.find((b) => b.phone === where.phone && b.removedAt === null) ?? null,
        },
    };
}
async function errorOf(p) {
    try {
        await p;
        return null;
    }
    catch (e) {
        return e;
    }
}
(0, node_test_1.describe)("contrôle des numéros de téléphone", () => {
    (0, node_test_1.test)("numéro libre : accepté", async () => {
        await (0, phone_owner_1.assertPhoneAvailable)(makeDb([]), "077000001", { revealOwner: true });
    });
    (0, node_test_1.test)("numéro d'un client : refusé, et l'administrateur voit quel client libérer", async () => {
        const db = makeDb([{ id: "c1", name: "Test client", role: "CLIENT", phone: "077000001" }]);
        const err = await errorOf((0, phone_owner_1.assertPhoneAvailable)(db, "077000001", { revealOwner: true }));
        strict_1.default.equal(err.code, "PHONE_TAKEN_BY_CLIENT");
        strict_1.default.equal(err.params.name, "Test client");
        strict_1.default.ok(err.message.includes("client") && err.message.includes("Test client"));
    });
    (0, node_test_1.test)("numéro d'un administrateur : refusé, et le compte administrateur est indiqué", async () => {
        const db = makeDb([{ id: "a1", name: "Awa", role: "ADMIN", phone: "077000002" }]);
        const err = await errorOf((0, phone_owner_1.assertPhoneAvailable)(db, "077000002", { revealOwner: true }));
        strict_1.default.equal(err.code, "PHONE_TAKEN_BY_ADMIN");
        strict_1.default.ok(err.message.includes("administrateur") && err.message.includes("Awa"));
    });
    (0, node_test_1.test)("inscription publique : le titulaire n'est jamais révélé", async () => {
        const db = makeDb([{ id: "c1", name: "Test client", role: "CLIENT", phone: "077000001" }]);
        const err = await errorOf((0, phone_owner_1.assertPhoneAvailable)(db, "077000001", { revealOwner: false }));
        strict_1.default.equal(err.code, "PHONE_ALREADY_USED");
        strict_1.default.equal(err.params, undefined);
        strict_1.default.ok(!err.message.includes("Test client"));
    });
    (0, node_test_1.test)("le compte lui-même peut garder son numéro", async () => {
        const db = makeDb([{ id: "c1", name: "Test client", role: "CLIENT", phone: "077000001" }]);
        await (0, phone_owner_1.assertPhoneAvailable)(db, "077000001", { exceptUserId: "c1", revealOwner: true });
    });
    (0, node_test_1.test)("numéro sur liste noire : refusé", async () => {
        const db = makeDb([], [{ phone: "077000009", removedAt: null }]);
        const err = await errorOf((0, phone_owner_1.assertPhoneAvailable)(db, "077000009", { revealOwner: true }));
        strict_1.default.equal(err.code, "PHONE_BLACKLISTED");
    });
    (0, node_test_1.test)("liste noire levée : le numéro redevient disponible", async () => {
        const db = makeDb([], [{ phone: "077000009", removedAt: new Date() }]);
        await (0, phone_owner_1.assertPhoneAvailable)(db, "077000009", { revealOwner: true });
    });
});

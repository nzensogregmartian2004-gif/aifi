import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertPhoneAvailable } from "./phone-owner";

function makeDb(users: any[], blacklist: any[] = []) {
  return {
    user: { findUnique: async ({ where }: any) => users.find((u) => u.phone === where.phone) ?? null },
    blacklistEntry: {
      findFirst: async ({ where }: any) => blacklist.find((b) => b.phone === where.phone && b.removedAt === null) ?? null,
    },
  };
}

async function errorOf(p: Promise<unknown>): Promise<any> {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
}

describe("contrôle des numéros de téléphone", () => {
  test("numéro libre : accepté", async () => {
    await assertPhoneAvailable(makeDb([]), "077000001", { revealOwner: true });
  });

  test("numéro d'un client : refusé, et l'administrateur voit quel client libérer", async () => {
    const db = makeDb([{ id: "c1", name: "Test client", role: "CLIENT", phone: "077000001" }]);
    const err = await errorOf(assertPhoneAvailable(db, "077000001", { revealOwner: true }));
    assert.equal(err.code, "PHONE_TAKEN_BY_CLIENT");
    assert.equal(err.params.name, "Test client");
    assert.ok(err.message.includes("client") && err.message.includes("Test client"));
  });

  test("numéro d'un administrateur : refusé, et le compte administrateur est indiqué", async () => {
    const db = makeDb([{ id: "a1", name: "Awa", role: "ADMIN", phone: "077000002" }]);
    const err = await errorOf(assertPhoneAvailable(db, "077000002", { revealOwner: true }));
    assert.equal(err.code, "PHONE_TAKEN_BY_ADMIN");
    assert.ok(err.message.includes("administrateur") && err.message.includes("Awa"));
  });

  test("inscription publique : le titulaire n'est jamais révélé", async () => {
    const db = makeDb([{ id: "c1", name: "Test client", role: "CLIENT", phone: "077000001" }]);
    const err = await errorOf(assertPhoneAvailable(db, "077000001", { revealOwner: false }));
    assert.equal(err.code, "PHONE_ALREADY_USED");
    assert.equal(err.params, undefined);
    assert.ok(!err.message.includes("Test client"));
  });

  test("le compte lui-même peut garder son numéro", async () => {
    const db = makeDb([{ id: "c1", name: "Test client", role: "CLIENT", phone: "077000001" }]);
    await assertPhoneAvailable(db, "077000001", { exceptUserId: "c1", revealOwner: true });
  });

  test("numéro sur liste noire : refusé", async () => {
    const db = makeDb([], [{ phone: "077000009", removedAt: null }]);
    const err = await errorOf(assertPhoneAvailable(db, "077000009", { revealOwner: true }));
    assert.equal(err.code, "PHONE_BLACKLISTED");
  });

  test("liste noire levée : le numéro redevient disponible", async () => {
    const db = makeDb([], [{ phone: "077000009", removedAt: new Date() }]);
    await assertPhoneAvailable(db, "077000009", { revealOwner: true });
  });
});

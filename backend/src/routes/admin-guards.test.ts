import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Garde-fous statiques : chaque action sensible doit être protégée côté serveur,
// pas seulement masquée dans l'application.
const src = readFileSync(join(process.cwd(), "src/routes/admin.routes.ts"), "utf8");

function routeSlice(header: string, length = 500): string {
  const i = src.indexOf(header);
  assert.ok(i >= 0, `route introuvable : ${header}`);
  return src.slice(i, i + length);
}

describe("garde-fous super administrateur (routes admin)", () => {
  test("cadeaux (création et historique) : réservés au super administrateur", () => {
    assert.ok(routeSlice('router.post("/gifts"').includes("requireSuperAdmin"));
    assert.ok(routeSlice('router.get("/gifts"').includes("requireSuperAdmin"));
  });

  test("bonus de points : réservé au super administrateur", () => {
    assert.ok(routeSlice('router.post("/users/:id/bonus"').includes("requireSuperAdmin"));
  });

  test("points, plafond et numéro d'un client : refusés aux administrateurs non super", () => {
    const block = routeSlice('router.patch("/users/:id"', 900);
    assert.ok(block.includes("SUPER_ADMIN_ONLY"));
    assert.ok(block.includes("isSuperAdmin"));
  });

  test("création d'administrateur, statut super, suspension et mot de passe : réservés au super", () => {
    assert.ok(routeSlice('router.post("/admins", requireSuperAdmin').includes("requireSuperAdmin"));
    assert.ok(routeSlice('router.patch("/admins/:id/super"').includes("requireSuperAdmin"));
    assert.ok(routeSlice('router.patch("/admins/:id/status"').includes("requireSuperAdmin"));
    assert.ok(routeSlice('router.post("/admins/:id/reset-password"').includes("requireSuperAdmin"));
  });
});

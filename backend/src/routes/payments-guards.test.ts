import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { confirmPaymentSchema, rejectPaymentSchema } from "../validation/schemas";

const src = readFileSync(join(process.cwd(), "src/routes/admin.routes.ts"), "utf8");

function routeSlice(header: string, length = 400): string {
  const i = src.indexOf(header);
  assert.ok(i >= 0, `route introuvable : ${header}`);
  return src.slice(i, i + length);
}

describe("confirmation manuelle des paiements", () => {
  test("liste des paiements en attente : route présente", () => {
    assert.ok(routeSlice('router.get("/payments/pending"').includes('status: "PENDING"'));
  });

  test("confirmation : valide la référence et passe par le chemin atomique", () => {
    const block = routeSlice('router.post("/payments/:id/confirm"');
    assert.ok(block.includes("validateBody(confirmPaymentSchema)"));
    assert.ok(block.includes("confirmPaymentManually"));
  });

  test("rejet : passe par le chemin atomique, avec motif optionnel", () => {
    const block = routeSlice('router.post("/payments/:id/reject"');
    assert.ok(block.includes("validateBody(rejectPaymentSchema)"));
    assert.ok(block.includes("rejectPaymentManually"));
  });

  test("une référence vide ou trop courte est refusée", () => {
    assert.equal(confirmPaymentSchema.safeParse({ providerReference: "" }).success, false);
    assert.equal(confirmPaymentSchema.safeParse({ providerReference: "ab" }).success, false);
    assert.equal(confirmPaymentSchema.safeParse({ providerReference: "   " }).success, false);
    assert.equal(confirmPaymentSchema.safeParse({ providerReference: "MP123456" }).success, true);
  });

  test("le motif de rejet est optionnel", () => {
    assert.equal(rejectPaymentSchema.safeParse({}).success, true);
  });
});

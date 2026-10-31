import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payRepaymentSchema } from "./schemas";

describe("numéro envoyé à MyPVit pour un remboursement", () => {
  test("format international gabonais ramené au format local (077000000)", () => {
    const r = payRepaymentSchema.parse({ amount: 1000, phone: "+241 77 00 00 00" });
    assert.equal(r.phone, "077000000");
  });
  test("format court sans indicatif accepté et normalisé", () => {
    const r = payRepaymentSchema.parse({ amount: 1000, phone: "77000000" });
    assert.equal(r.phone, "077000000");
  });
  test("numéro absent accepté (paiement par carte)", () => {
    const r = payRepaymentSchema.parse({ amount: 1000 });
    assert.equal(r.phone, undefined);
  });
});

describe("messages de réception de la clé MyPVit", () => {
  test("l'erreur indique la vraie route de réception, sans /api/webhooks", () => {
    const src = readFileSync(join(process.cwd(), "src/modules/payments/mypvit.client.ts"), "utf8");
    assert.equal(src.includes("/api/webhooks"), false);
    assert.equal(src.includes("POST /api/payments/mypvit/secret"), true);
  });
});

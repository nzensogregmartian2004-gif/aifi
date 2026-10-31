import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildStatusRequest, parseStatusResponse } from "./mypvit.client";

describe("vérification de statut MyPVit (conforme à la collection officielle)", () => {
  test("requête GET avec transactionId MyPVit, compte et type d'opération en paramètres", () => {
    const { url } = buildStatusRequest("PAY23102400001", "ACC_1XXXXXXXX", "PAYMENT");
    const parsed = new URL(url);
    assert.equal(parsed.pathname.endsWith("/status"), true);
    assert.equal(parsed.searchParams.get("transactionId"), "PAY23102400001");
    assert.equal(parsed.searchParams.get("accountOperationCode"), "ACC_1XXXXXXXX");
    assert.equal(parsed.searchParams.get("transactionOperation"), "PAYMENT");
  });

  test("n'envoie jamais notre référence marchande à la place de l'identifiant MyPVit", () => {
    const { url } = buildStatusRequest("PAY23102400001", "ACC_1XXXXXXXX", "PAYMENT");
    assert.equal(url.includes("REF"), false);
  });

  test("lit le statut de la réponse officielle (SUCCESS)", () => {
    const officialExample = {
      date: "23/10/2024 12:39:08",
      status: "SUCCESS",
      amount: 150,
      fees: 3.5,
      operator: "AIRTEL_MONEY",
      merchant_reference_id: "REF1234567890",
      customer_account_number: "074111111",
      merchant_operation_account_code: "ACC_1XXXXXXXX",
    };
    assert.equal(parseStatusResponse(officialExample), "SUCCESS");
  });

  test("statuts FAILED et PENDING reconnus, insensibles à la casse", () => {
    assert.equal(parseStatusResponse({ status: "failed" }), "FAILED");
    assert.equal(parseStatusResponse({ status: "Pending" }), "PENDING");
  });

  test("réponse sans statut reconnu : null, jamais une supposition", () => {
    assert.equal(parseStatusResponse({ status: "ON_HOLD" }), null);
    assert.equal(parseStatusResponse({}), null);
    assert.equal(parseStatusResponse(null), null);
  });
});

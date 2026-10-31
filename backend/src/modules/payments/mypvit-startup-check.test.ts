import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL = "ACC_STARTUP1";
process.env.MYPVIT_URLCODE_RENEW_SECRET = "RENEW1";
process.env.MYPVIT_API_PASSWORD = "pw";
process.env.MYPVIT_RECEPTION_URL_CODE = "RECV1";
process.env.MYPVIT_CALLBACK_URL_CODE = "CB1";

describe("contrôle de connexion MyPVit au démarrage", () => {
  test("succès : le journal indique la connexion, sans jamais afficher la clé", async () => {
    const mod = await import("./mypvit.client");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ secret: "SECRET_NE_DOIT_PAS_APPARAITRE", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as any;
    const logs: string[] = [];
    try {
      await mod.checkMypvitConnections((m) => logs.push(m), (m) => logs.push(m));
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("connexion OK"));
    assert.equal(logs.join("\n").includes("SECRET_NE_DOIT_PAS_APPARAITRE"), false);
  });
});

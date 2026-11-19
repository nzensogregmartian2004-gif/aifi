import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { apiNotFound } from "./not-found";

// Petite app de test : une route existante, puis le 404 JSON pour /api.
async function withApp(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.get("/api/ok", (_req, res) => res.json({ ok: true }));
  app.use("/api", apiNotFound);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

describe("404 JSON pour les routes /api inconnues", () => {
  test("une route inconnue renvoie 404 JSON qui nomme la méthode et le chemin", async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/account/inexistante`, { method: "PUT" });
      assert.equal(res.status, 404);
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      const body = (await res.json()) as { error: string; code: string; method: string; path: string };
      assert.equal(body.code, "ROUTE_NOT_FOUND");
      assert.equal(body.method, "PUT");
      assert.equal(body.path, "/api/account/inexistante");
      assert.match(body.error, /PUT \/api\/account\/inexistante/);
    });
  });

  test("une route existante n'est pas touchée par le 404", async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/ok`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    });
  });
});

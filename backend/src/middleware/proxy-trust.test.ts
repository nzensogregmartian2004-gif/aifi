import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "http";

// Chaîne : client (forgé 9.9.9.9) -> Cloudflare ajoute l'IP réelle -> Render ajoute l'IP de Cloudflare.
// Le serveur reçoit donc : X-Forwarded-For: 9.9.9.9, 203.0.113.7, 162.158.1.1 depuis Render.
describe("trust proxy = 2 derrière Cloudflare et Render", () => {
  let server: http.Server; let port = 0;

  before(async () => {
    const app = express();
    app.set("trust proxy", 2);
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    port = (server.address() as any).port;
  });
  after(() => server.close());

  const ipFor = (xff: string) => new Promise<string>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: "/ip", headers: { "X-Forwarded-For": xff } }, (res) => {
      let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve(JSON.parse(body).ip));
    }).on("error", reject);
  });

  test("req.ip est l'IP réelle du client, pas celle du proxy Cloudflare", async () => {
    assert.equal(await ipFor("9.9.9.9, 203.0.113.7, 162.158.1.1"), "203.0.113.7");
  });

  test("une IP forgée en tête de chaîne ne change pas req.ip", async () => {
    assert.equal(await ipFor("1.1.1.1, 203.0.113.7, 162.158.1.1"), "203.0.113.7");
  });

  test("deux clients distincts ont deux IP distinctes (plus de limite partagée)", async () => {
    const a = await ipFor("203.0.113.7, 162.158.1.1");
    const b = await ipFor("198.51.100.20, 162.158.1.1");
    assert.notEqual(a, b);
  });
});

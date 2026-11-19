"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
// Chaîne : client (forgé 9.9.9.9) -> Cloudflare ajoute l'IP réelle -> Render ajoute l'IP de Cloudflare.
// Le serveur reçoit donc : X-Forwarded-For: 9.9.9.9, 203.0.113.7, 162.158.1.1 depuis Render.
(0, node_test_1.describe)("trust proxy = 2 derrière Cloudflare et Render", () => {
    let server;
    let port = 0;
    (0, node_test_1.before)(async () => {
        const app = (0, express_1.default)();
        app.set("trust proxy", 2);
        app.get("/ip", (req, res) => res.json({ ip: req.ip }));
        server = app.listen(0);
        await new Promise((r) => server.once("listening", r));
        port = server.address().port;
    });
    (0, node_test_1.after)(() => server.close());
    const ipFor = (xff) => new Promise((resolve, reject) => {
        http_1.default.get({ host: "127.0.0.1", port, path: "/ip", headers: { "X-Forwarded-For": xff } }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve(JSON.parse(body).ip));
        }).on("error", reject);
    });
    (0, node_test_1.test)("req.ip est l'IP réelle du client, pas celle du proxy Cloudflare", async () => {
        strict_1.default.equal(await ipFor("9.9.9.9, 203.0.113.7, 162.158.1.1"), "203.0.113.7");
    });
    (0, node_test_1.test)("une IP forgée en tête de chaîne ne change pas req.ip", async () => {
        strict_1.default.equal(await ipFor("1.1.1.1, 203.0.113.7, 162.158.1.1"), "203.0.113.7");
    });
    (0, node_test_1.test)("deux clients distincts ont deux IP distinctes (plus de limite partagée)", async () => {
        const a = await ipFor("203.0.113.7, 162.158.1.1");
        const b = await ipFor("198.51.100.20, 162.158.1.1");
        strict_1.default.notEqual(a, b);
    });
});

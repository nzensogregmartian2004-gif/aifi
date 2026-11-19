"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const express_1 = __importDefault(require("express"));
const not_found_1 = require("./not-found");
// Petite app de test : une route existante, puis le 404 JSON pour /api.
async function withApp(fn) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.get("/api/ok", (_req, res) => res.json({ ok: true }));
    app.use("/api", not_found_1.apiNotFound);
    const server = app.listen(0);
    const { port } = server.address();
    try {
        await fn(`http://127.0.0.1:${port}`);
    }
    finally {
        server.close();
    }
}
(0, node_test_1.describe)("404 JSON pour les routes /api inconnues", () => {
    (0, node_test_1.test)("une route inconnue renvoie 404 JSON qui nomme la méthode et le chemin", async () => {
        await withApp(async (base) => {
            const res = await fetch(`${base}/api/account/inexistante`, { method: "PUT" });
            strict_1.default.equal(res.status, 404);
            strict_1.default.match(res.headers.get("content-type") ?? "", /application\/json/);
            const body = (await res.json());
            strict_1.default.equal(body.code, "ROUTE_NOT_FOUND");
            strict_1.default.equal(body.method, "PUT");
            strict_1.default.equal(body.path, "/api/account/inexistante");
            strict_1.default.match(body.error, /PUT \/api\/account\/inexistante/);
        });
    });
    (0, node_test_1.test)("une route existante n'est pas touchée par le 404", async () => {
        await withApp(async (base) => {
            const res = await fetch(`${base}/api/ok`);
            strict_1.default.equal(res.status, 200);
            strict_1.default.deepEqual(await res.json(), { ok: true });
        });
    });
});

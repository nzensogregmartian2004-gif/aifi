"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const scheduler_1 = require("./jobs/scheduler");
const port = Number(env_1.env.port);
app_1.app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
    (0, scheduler_1.startScheduler)();
});

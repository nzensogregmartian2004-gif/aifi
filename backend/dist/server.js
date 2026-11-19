"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const scheduler_1 = require("./jobs/scheduler");
const mypvit_client_1 = require("./modules/payments/mypvit.client");
const port = Number(env_1.env.port);
app_1.app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
    (0, scheduler_1.startScheduler)();
    // Contrôle MyPVit en arrière-plan : aucun paiement, résultat visible dans les logs Render
    void (0, mypvit_client_1.checkMypvitConnections)();
});

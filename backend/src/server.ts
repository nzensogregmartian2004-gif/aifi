import { app } from "./app";
import { env } from "./config/env";
import { startScheduler } from "./jobs/scheduler";
import { checkMypvitConnections } from "./modules/payments/mypvit.client";

const port = Number(env.port);

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
  startScheduler();
  // Contrôle MyPVit en arrière-plan : aucun paiement, résultat visible dans les logs Render
  void checkMypvitConnections();
});
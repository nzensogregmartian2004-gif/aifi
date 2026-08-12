import { app } from "./app";
import { env } from "./config/env";
import { startScheduler } from "./jobs/scheduler";

const port = Number(env.port);

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
  startScheduler();
});
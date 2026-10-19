import cron from "node-cron";
import { applyLatePenalties } from "./late-penalty.job";
import { sendRepaymentReminders } from "./repayment-reminder.job";
import { flagStalePayments } from "./stale-payment.job";
import { blockOverdueAccounts } from "./account-block.job";
import { expirePremiumSubscriptions } from "./expire-premium.job";
import { getSecret } from "../modules/payments/mypvit.client";
import { isMypvitConfigured, configuredOperators } from "../config/env";

/**
 * Exécute une tâche planifiée sans jamais laisser remonter son erreur : une
 * tâche qui échoue est journalisée, et les suivantes s'exécutent quand même.
 */
async function runSafely<T>(label: string, job: () => Promise<T>): Promise<T | null> {
  try {
    return await job();
  } catch (err) {
    console.error(`[scheduler] ${label} : échec`, err);
    return null;
  }
}

export function startScheduler() {
  // tous les jours à 6h
  cron.schedule("0 6 * * *", async () => {
    const penaltyResult = await runSafely("pénalités de retard", () => applyLatePenalties());
    const reminderResult = await runSafely("rappels d'échéance", () => sendRepaymentReminders());
    // Après la pénalité/rappel du jour, blocage des comptes en retard depuis plus de 3 jours
    const blockResult = await runSafely("blocage des comptes en retard", () => blockOverdueAccounts());
    const premiumResult = await runSafely("expiration AIFI+", () => expirePremiumSubscriptions());
    console.log("[scheduler]", penaltyResult, reminderResult, blockResult, premiumResult);
  });

  // La clé secrète MyPVit expire au bout d'1h : renouvellement toutes les 45 min,
  // séparément pour chaque compte configuré (un secret ne vaut que pour son compte).
  if (isMypvitConfigured()) {
    cron.schedule("*/45 * * * *", async () => {
      for (const operator of configuredOperators()) {
        await runSafely(`renouvellement de clé MyPVit (${operator})`, async () => {
          await getSecret(operator, true);
          console.log(`[scheduler] clé MyPVit renouvelée (${operator})`);
        });
      }
    });

    // Filet de secours : rattrape les paiements restés PENDING trop longtemps
    cron.schedule("*/5 * * * *", async () => {
      const result = await runSafely("paiements incertains", () => flagStalePayments());
      if (result && result.flagged > 0) {
        console.log("[scheduler] paiements incertains signalés:", result.flagged);
      }
    });
  }
}

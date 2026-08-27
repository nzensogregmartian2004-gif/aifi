import cron from "node-cron";
import { applyLatePenalties } from "./late-penalty.job";
import { sendRepaymentReminders } from "./repayment-reminder.job";
import { flagStalePayments } from "./stale-payment.job";
import { getSecret } from "../modules/payments/mypvit.client";
import { isMypvitConfigured, configuredOperators } from "../config/env";

export function startScheduler() {
  // tous les jours à 6h du matin
  cron.schedule("0 6 * * *", async () => {
    const penaltyResult = await applyLatePenalties();
    const reminderResult = await sendRepaymentReminders();
    console.log("[scheduler]", penaltyResult, reminderResult);
  });

  // La clé secrète MyPVit expire au bout d'1h : on la renouvelle toutes les 45 min,
  // séparément pour chaque compte configuré (Airtel / Moov / Carte) — un secret
  // ne vaut que pour le compte qui l'a émis.
  if (isMypvitConfigured()) {
    cron.schedule("*/45 * * * *", async () => {
      for (const operator of configuredOperators()) {
        try {
          await getSecret(operator, true);
          console.log(`[scheduler] clé MyPVit renouvelée (${operator})`);
        } catch (err) {
          console.error(`[scheduler] échec du renouvellement de la clé MyPVit (${operator})`, err);
        }
      }
    });

    // Filet de secours : signale les paiements restés PENDING trop longtemps
    // (voir stale-payment.job.ts — en l'absence d'API Check Status disponible).
    cron.schedule("*/5 * * * *", async () => {
      try {
        const result = await flagStalePayments();
        if (result.flagged > 0) console.log("[scheduler] paiements incertains signalés:", result.flagged);
      } catch (err) {
        console.error("[scheduler] échec de la vérification des paiements incertains", err);
      }
    });
  }
}
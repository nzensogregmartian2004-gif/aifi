"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const premium_reminder_job_1 = require("./premium-reminder.job");
const auth_controller_1 = require("../modules/users/auth.controller");
const node_cron_1 = __importDefault(require("node-cron"));
const late_surcharge_job_1 = require("./late-surcharge.job");
const repayment_reminder_job_1 = require("./repayment-reminder.job");
const stale_payment_job_1 = require("./stale-payment.job");
const expire_premium_job_1 = require("./expire-premium.job");
const mypvit_client_1 = require("../modules/payments/mypvit.client");
const env_1 = require("../config/env");
/**
 * Exécute une tâche planifiée sans jamais laisser remonter son erreur : une
 * tâche qui échoue est journalisée, et les suivantes s'exécutent quand même.
 */
async function runSafely(label, job) {
    try {
        return await job();
    }
    catch (err) {
        console.error(`[scheduler] ${label} : échec`, err);
        return null;
    }
}
function startScheduler() {
    // tous les jours à 6h, heure de Libreville (Gabon, UTC+1)
    node_cron_1.default.schedule("0 6 * * *", async () => {
        // Retards : jour de grâce (message) puis majoration quotidienne. Pas de blocage de compte.
        const surchargeResult = await runSafely("majoration des retards", () => (0, late_surcharge_job_1.applyLateSurcharges)());
        const reminderResult = await runSafely("rappels d'échéance", () => (0, repayment_reminder_job_1.sendRepaymentReminders)());
        const premiumResult = await runSafely("expiration AIFI+", () => (0, expire_premium_job_1.expirePremiumSubscriptions)());
        const premiumRemindResult = await runSafely("rappels AIFI+", () => (0, premium_reminder_job_1.sendPremiumExpiryReminders)());
        await runSafely("purge des tentatives de connexion", () => (0, auth_controller_1.purgeOldLoginAttempts)());
        console.log("[scheduler]", surchargeResult, reminderResult, premiumResult, premiumRemindResult);
    }, { timezone: "Africa/Libreville" });
    // La clé secrète MyPVit expire au bout d'1h : renouvellement toutes les 45 min,
    // séparément pour chaque compte configuré (un secret ne vaut que pour son compte).
    if ((0, env_1.isMypvitConfigured)()) {
        node_cron_1.default.schedule("*/45 * * * *", async () => {
            for (const operator of (0, env_1.configuredOperators)()) {
                await runSafely(`renouvellement de clé MyPVit (${operator})`, async () => {
                    await (0, mypvit_client_1.getSecret)(operator, true);
                    console.log(`[scheduler] clé MyPVit renouvelée (${operator})`);
                });
            }
        });
        // Filet de secours : rattrape les paiements restés PENDING trop longtemps
        node_cron_1.default.schedule("*/5 * * * *", async () => {
            const result = await runSafely("paiements incertains", () => (0, stale_payment_job_1.flagStalePayments)());
            if (result && result.flagged > 0) {
                console.log("[scheduler] paiements incertains signalés:", result.flagged);
            }
        });
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_LANGUAGES = exports.TEMPLATES = void 0;
exports.normalizeLang = normalizeLang;
exports.renderNotification = renderNotification;
exports.renderFrench = renderFrench;
const i18n_1 = require("./i18n");
exports.TEMPLATES = {
    premium_expired: "Ton abonnement AIFI+ a expiré. Renouvelle-le pour retrouver tes avantages (commissions de parrainage, frais réduits, paliers supérieurs).",
    late_grace_start: "Ton échéance est arrivée à expiration. Tu as {days} jour(s) de grâce pour rembourser sans majoration. Passé ce délai, le montant dû augmentera de {daily} FCFA par jour de retard.",
    late_grace_reminder: "Jour de grâce : il te reste {days} jour(s) pour rembourser sans majoration. Passé ce délai, le montant dû augmentera de {daily} FCFA par jour de retard.",
    late_surcharge: "Retard de remboursement : ton montant dû passe à {total} FCFA (+{added} FCFA) et tu perds {points} points de confiance (jour de retard n°{days}). Rembourse au plus vite.",
    premium_expiring: "Ton abonnement AIFI+ expire dans {days} jour(s). Renouvelle-le pour garder les paliers supérieurs et les frais réduits.",
    reminder_today: "Ton remboursement de {amount} FCFA arrive à échéance aujourd'hui.",
    reminder_days: "Ton remboursement de {amount} FCFA arrive à échéance dans {days} jour(s).",
    payment_uncertain: "On n'a toujours pas reçu la confirmation de ton paiement Mobile Money. Si l'argent a été débité, déclare-le manuellement avec une capture d'écran pour qu'on vérifie.",
    aid_request_accepted: "Votre demande de {amount} FCFA a été acceptée. Remboursement attendu avant le {dueDate}.",
    aid_request_rejected: "Votre demande de {amount} FCFA a été refusée.",
    aid_request_disbursed: "Les fonds de votre demande de {amount} FCFA ont été envoyés.",
    aid_request_disbursed_auto: "Les fonds de votre demande de {amount} FCFA ont été envoyés automatiquement sur ton compte {operator}.",
    admin_message: "Vous avez reçu un message de l'administrateur.",
    premium_activated: "Ton abonnement AIFI+ est actif jusqu'au {date}. Profite de tes avantages !",
    payment_failed_premium: "Ton paiement pour l'abonnement AIFI+ n'a pas abouti. Tu peux réessayer depuis l'écran AIFI+.",
    payment_failed_repayment: "Ton paiement Mobile Money n'a pas abouti. Tu peux réessayer ou déclarer un remboursement manuel.",
    streak_bonus: "Bravo : {streak} remboursements à temps d'affilée. Tu reçois {points} points de niveau de confiance.",
    repayment_recorded_full: "Votre aide de {amount} FCFA a été entièrement remboursée. Merci !",
    repayment_recorded: "Un remboursement de {amount} FCFA a été enregistré. Reste dû : {remaining} FCFA.",
    repayment_declaration_rejected: "Votre déclaration de remboursement de {amount} FCFA n'a pas été confirmée. Contactez l'administrateur.",
    repayment_declaration_rejected_reason: "Votre déclaration de remboursement de {amount} FCFA n'a pas été confirmée : {reason}. Contactez l'administrateur.",
    referral_validated: "{name}, que vous avez parrainé, a été validé. Vous recevez {bonus} FCFA et {points} points.",
    account_validated: "Votre compte a été validé. Vous pouvez maintenant l'utiliser.",
    account_suspended: "Votre compte a été suspendu par l'administrateur.",
    account_suspended_reason: "Votre compte a été suspendu. Motif : {reason}",
    account_reactivated: "Votre compte a été réactivé.",
    verification_approved: "Ton identité a été vérifiée.",
    verification_rejected: "Ton dossier d'identité a été refusé : {reason}. Renvoie tes documents depuis Profil > Vérification d'identité.",
    withdrawal_approved: "Votre retrait de {amount} FCFA a été approuvé et envoyé.",
    withdrawal_approved_auto: "Votre retrait de {amount} FCFA a été envoyé automatiquement sur votre compte {operator}.",
    withdrawal_rejected: "Votre retrait de {amount} FCFA a été refusé.",
    trust_bonus: "{text} Tu reçois {delta} points de niveau de confiance.",
    gift: "{text} {reward}",
    premium_granted: "Ton compte est passé AIFI+ ! Profite des commissions de parrainage, des frais réduits et des paliers supérieurs.",
    premium_deactivated: "Ton abonnement AIFI+ a été désactivé.",
    admin_aid_request_created: "{name} a demandé une aide de {amount} FCFA.",
    admin_client_message: "{name} a envoyé un message.",
    admin_payment_uncertain: "Paiement MyPVit incertain pour {name} ({amount} FCFA, réf {reference}) — aucun callback reçu après 5 min.",
    admin_repayment_declared: "{name} déclare avoir remboursé {amount} FCFA sur sa demande de {requested} FCFA (à rembourser : {due} FCFA).",
    admin_withdrawal_requested: "{name} demande un retrait de {amount} FCFA de son portefeuille.",
};
exports.SUPPORTED_LANGUAGES = ["fr", "en", "ar", "pt", "es"];
/** Langue d'un client : une valeur inconnue retombe sur le français. */
function normalizeLang(value) {
    return exports.SUPPORTED_LANGUAGES.includes(value) ? value : "fr";
}
const DATE_LOCALE = { fr: "fr-FR", en: "en-GB", ar: "ar", pt: "pt-PT", es: "es-ES" };
/**
 * Texte d'une notification dans la langue donnée. Accepte les marqueurs {champ} (modèles
 * français) et {{champ}} (fichiers de langue). Une date (dueDate, date) est formatée
 * selon la langue.
 */
function renderNotification(type, params = {}, lang = "fr") {
    const template = (lang !== "fr" ? i18n_1.LOCALES[lang]?.[type] : undefined) ?? exports.TEMPLATES[type] ?? type;
    return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_match, doubled, single) => {
        const key = doubled ?? single;
        const value = params[key];
        if (value === undefined || value === null)
            return "";
        if ((key === "dueDate" || key === "date") && typeof value === "string" && value) {
            return new Date(value).toLocaleDateString(DATE_LOCALE[lang]);
        }
        return String(value);
    });
}
/** Texte français (repli, et anciennes notifications). */
function renderFrench(type, params = {}) {
    return renderNotification(type, params, "fr");
}

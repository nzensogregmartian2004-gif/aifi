"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiveSecretFromWebhook = receiveSecretFromWebhook;
exports.getSecret = getSecret;
exports.detectOperator = detectOperator;
exports.initiatePayment = initiatePayment;
exports.generatePaymentReference = generatePaymentReference;
exports.generateDisbursementReference = generateDisbursementReference;
exports.giveChange = giveChange;
exports.checkTransactionStatus = checkTransactionStatus;
exports.checkKyc = checkKyc;
exports.getOperators = getOperators;
const errors_1 = require("../../errors");
const events_1 = require("events");
const env_1 = require("../../config/env");
/**
 * Client pour l'API MyPVit (https://docs.mypvit.pro).
 *
 * Deux flux d'argent sont couverts, tous deux confirmés par la documentation
 * officielle :
 *  - initiatePayment  : le client paie le marchand (PAYMENT, asynchrone, statut
 *    final par webhook).
 *  - giveChange       : le marchand reverse de l'argent au client (GIVE_CHANGE,
 *    synchrone, statut final directement dans la réponse — pas de webhook).
 *
 * La clé secrète (renew-secret) peut elle-même arriver de façon asynchrone :
 * selon la configuration du compte MyPVit, la clé n'est pas dans la réponse
 * HTTP immédiate de /renew-secret mais envoyée séparément, en POST, sur
 * l'URL webhook enregistrée sous le code "receptionUrlCode" (dashboard
 * MyPVit, à créer manuellement — voir MYPVIT_RECEPTION_URL_CODE). On gère
 * les deux cas : réponse immédiate si présente, sinon on attend ce webhook
 * jusqu'à 15s (voir receiveSecretFromWebhook, appelée par la route
 * /webhooks/mypvit/secret).
 */
const secretEvents = new events_1.EventEmitter();
secretEvents.setMaxListeners(50);
// Comptes actuellement en attente d'un secret par webhook, dans l'ordre
// d'envoi de la demande — sert de repli quand le webhook MyPVit ne renvoie
// pas le operationAccountCode concerné (voir receiveSecretFromWebhook).
const pendingAccounts = [];
// Un secret mis en cache PAR compte : le secret d'un compte Airtel ne doit
// jamais être envoyé avec le operationAccountCode du compte Moov (ou Carte),
// sous peine d'AUTHENTICATION_FAILED — c'est le bug du 27/08.
const cachedSecrets = {};
/**
 * Appelée par la route webhook quand MyPVit envoie la clé de façon
 * asynchrone. `accountCode` est le operationAccountCode renvoyé par MyPVit
 * dans le payload du webhook, s'il est présent — permet de router le secret
 * vers le bon compte quand plusieurs renouvellements sont en attente en même
 * temps. S'il est absent, on retombe sur la plus ancienne demande en attente.
 */
function receiveSecretFromWebhook(secretValue, expiresInSeconds = 3000, accountCode) {
    const expiresAt = Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000;
    let operatorCode = accountCode
        ? Object.keys(env_1.env.mypvit.accounts).find((op) => env_1.env.mypvit.accounts[op] === accountCode)
        : undefined;
    if (operatorCode) {
        const idx = pendingAccounts.indexOf(operatorCode);
        if (idx !== -1)
            pendingAccounts.splice(idx, 1);
    }
    else {
        operatorCode = pendingAccounts.shift();
    }
    if (!operatorCode) {
        console.warn("[mypvit] secret reçu par webhook sans demande en attente correspondante, ignoré.");
        return;
    }
    cachedSecrets[operatorCode] = { value: secretValue, expiresAt };
    secretEvents.emit(`secret:${operatorCode}`, secretValue);
}
function waitForWebhookSecret(operatorCode, timeoutMs = 15000) {
    pendingAccounts.push(operatorCode);
    const eventName = `secret:${operatorCode}`;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            secretEvents.off(eventName, onSecret);
            const idx = pendingAccounts.indexOf(operatorCode);
            if (idx !== -1)
                pendingAccounts.splice(idx, 1);
            reject(new Error(`MyPVit n'a pas envoyé la clé secrète (compte ${operatorCode}) dans le délai imparti (15s). Vérifie que l'URL ` +
                "webhook de réception (POST /api/webhooks/mypvit/secret) est bien enregistrée dans ton espace MyPVit sous le " +
                "code MYPVIT_RECEPTION_URL_CODE, et joignable depuis internet."));
        }, timeoutMs);
        function onSecret(value) {
            clearTimeout(timer);
            resolve(value);
        }
        secretEvents.once(eventName, onSecret);
    });
}
async function fetchNewSecret(operatorCode) {
    const accountCode = env_1.env.mypvit.accounts[operatorCode];
    if (!accountCode) {
        throw new errors_1.AppError("PROVIDER_NOT_CONFIGURED", `Aucun operationAccountCode configuré pour ${operatorCode}.`);
    }
    const url = `${env_1.env.mypvit.baseUrl}/v2/${env_1.env.mypvit.urlCodes.renewSecret}/renew-secret`;
    const body = new URLSearchParams({
        operationAccountCode: accountCode,
        password: env_1.env.mypvit.apiPassword,
        receptionUrlCode: env_1.env.mypvit.receptionUrlCode,
    });
    // On commence à écouter AVANT d'envoyer la requête : si MyPVit répond très
    // vite par webhook, on ne veut pas rater l'événement en le configurant trop tard.
    const waiter = waitForWebhookSecret(operatorCode);
    waiter.catch(() => { }); // évite un rejet de promesse non géré si la réponse immédiate suffit
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new errors_1.AppError("PROVIDER_ERROR", `MyPVit renew-secret a échoué pour ${operatorCode} (${res.status}): ${text}`);
    }
    // Selon le compte, la clé peut arriver directement dans cette réponse...
    const data = (await res.json().catch(() => null));
    if (data?.secret) {
        // Résolue immédiatement : on retire la demande en attente pour qu'un
        // webhook tardif ne vienne pas la consommer par erreur plus tard.
        const idx = pendingAccounts.indexOf(operatorCode);
        if (idx !== -1)
            pendingAccounts.splice(idx, 1);
        cachedSecrets[operatorCode] = { value: data.secret, expiresAt: Date.now() + ((data.expires_in || 3000) - 300) * 1000 };
        return cachedSecrets[operatorCode].value;
    }
    // ...sinon elle arrive de façon asynchrone sur le webhook de réception.
    return waiter;
}
async function getSecret(operatorCode, forceRenew = false) {
    if (!(0, env_1.isMypvitConfigured)(operatorCode)) {
        throw new errors_1.AppError("PROVIDER_NOT_CONFIGURED", `MyPVit n'est pas configuré pour ${operatorCode} (variable d'environnement manquante)`);
    }
    const cached = cachedSecrets[operatorCode];
    if (!forceRenew && cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    return fetchNewSecret(operatorCode);
}
/** Détecte l'opérateur mobile money à partir du préfixe du numéro gabonais. */
function detectOperator(phone) {
    const digits = phone.replace(/\D/g, "").slice(-8); // derniers 8 chiffres du numéro local
    const prefix2 = digits.slice(0, 2);
    // Préfixes indicatifs Gabon — Airtel : 04, 05, 06 / Moov : 02, 07
    if (["04", "05", "06"].includes(prefix2))
        return "AIRTEL_MONEY";
    if (["02", "07"].includes(prefix2))
        return "MOOV_MONEY";
    return null;
}
async function initiatePayment(params, retry = true) {
    const secret = await getSecret(params.operatorCode);
    const url = `${env_1.env.mypvit.baseUrl}/v2/${env_1.env.mypvit.urlCodes.rest}/rest`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "X-Secret": secret,
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            agent: params.agent || "AIFI-APP",
            amount: params.amount,
            callback_url_code: env_1.env.mypvit.callbackUrlCode,
            customer_account_number: params.phone,
            merchant_operation_account_code: env_1.env.mypvit.accounts[params.operatorCode],
            transaction_type: "PAYMENT",
            owner_charge: "CUSTOMER",
            owner_charge_operator: "CUSTOMER",
            free_info: params.freeInfo,
            product: "AIFI",
            operator_code: params.operatorCode,
            reference: params.reference,
            service: "RESTFUL",
        }),
    });
    // Clé expirée ou invalide : on la renouvelle une fois puis on retente.
    if (res.status === 401 && retry) {
        await getSecret(params.operatorCode, true);
        return initiatePayment(params, false);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
        // Détail technique dans les logs serveur uniquement, jamais dans l'app.
        console.error(`[mypvit] initiatePayment refusé (${res.status}) operator=${params.operatorCode}:`, JSON.stringify(data));
        const code = data?.error;
        if (code === "OPERATOR_NOT_ACTIVE") {
            throw new errors_1.AppError("METHOD_UNAVAILABLE", "Ce moyen de paiement n'est pas encore disponible. Choisis un autre moyen ou réessaie plus tard.");
        }
        throw new errors_1.AppError("PAYMENT_START_FAILED", "Le paiement n'a pas pu être lancé. Réessaie dans quelques instants.");
    }
    return data;
}
/**
 * Génère une référence courte (≤13 caractères, exigence MyPVit) à partir d'un id.
 * Préfixe "R" (repayment) + timestamp compact + suffixe aléatoire.
 */
function generatePaymentReference() {
    const base36Time = Date.now().toString(36).slice(-6);
    const rand = Math.random().toString(36).slice(2, 6);
    return `R${base36Time}${rand}`.slice(0, 13).toUpperCase();
}
/**
 * Génère une référence pour un décaissement (préfixe "G" pour give_change).
 */
function generateDisbursementReference() {
    const base36Time = Date.now().toString(36).slice(-6);
    const rand = Math.random().toString(36).slice(2, 6);
    return `G${base36Time}${rand}`.slice(0, 13).toUpperCase();
}
/**
 * Reverse de l'argent du compte marchand vers un client (GIVE_CHANGE).
 * Contrairement à initiatePayment, cette opération est SYNCHRONE : la réponse
 * contient directement le statut final (SUCCESS/FAILED), sans webhook.
 * `owner_charge: "MERCHANT"` — le marchand supporte les frais, pour que le
 * client reçoive bien le montant plein annoncé.
 */
async function giveChange(params, retry = true) {
    const secret = await getSecret(params.operatorCode);
    const url = `${env_1.env.mypvit.baseUrl}/v2/${env_1.env.mypvit.urlCodes.rest}/rest`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "X-Secret": secret,
            "X-Callback-MediaType": "application/json",
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            agent: params.agent || "AIFI-APP",
            amount: params.amount,
            product: "AIFI",
            reference: params.reference,
            service: "RESTFUL",
            customer_account_number: params.phone,
            merchant_operation_account_code: env_1.env.mypvit.accounts[params.operatorCode],
            transaction_type: "GIVE_CHANGE",
            owner_charge: "MERCHANT",
            owner_charge_operator: "CUSTOMER",
            free_info: params.freeInfo,
            operator_code: params.operatorCode,
        }),
    });
    if (res.status === 401 && retry) {
        await getSecret(params.operatorCode, true);
        return giveChange(params, false);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
        throw new errors_1.AppError("PROVIDER_ERROR", `MyPVit a refusé le décaissement (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
}
/**
 * Interroge le statut d'une transaction (endpoint v1 "/status").
 *
 * ⚠️ Le format exact de la requête/réponse de cet endpoint n'est PAS publié
 * dans la doc MyPVit actuelle (contrairement à renew-secret et /rest). Cette
 * implémentation est une hypothèse raisonnable (mêmes conventions que le
 * reste de l'API : X-Secret, JSON, mêmes noms de champs vus dans le callback)
 * mais N'A PAS été confirmée avec MyPVit.
 *
 * Par sécurité, la fonction est volontairement stricte : elle ne renvoie un
 * statut exploitable QUE si la réponse contient un champ "status" reconnu
 * (SUCCESS/FAILED/PENDING). Toute réponse inattendue renvoie `null` — jamais
 * une supposition — pour ne jamais faire croire à tort qu'un paiement a
 * réussi. Le job appelant (stale-payment.job.ts) doit continuer à traiter
 * `null` comme "toujours incertain, ne rien créditer".
 */
async function checkTransactionStatus(reference, operatorCode) {
    try {
        const secret = await getSecret(operatorCode);
        const accountCode = env_1.env.mypvit.accounts[operatorCode];
        const url = `${env_1.env.mypvit.baseUrl}/${env_1.env.mypvit.urlCodes.status}/status`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "X-Secret": secret, Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
                // On envoie plusieurs variantes de nom de champ (snake_case et
                // camelCase) faute de savoir laquelle MyPVit attend ici — un champ
                // en trop est ignoré par la plupart des API, donc sans risque.
                reference,
                merchant_reference_id: reference,
                merchantReferenceId: reference,
                operation_account_code: accountCode,
                operationAccountCode: accountCode,
            }),
        });
        const data = await res.json().catch(() => null);
        if (!data)
            return null;
        const status = (data.status || data.transaction_status || data.transactionStatus || "").toString().toUpperCase();
        if (["SUCCESS", "FAILED", "PENDING"].includes(status)) {
            return status;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Vérification d'identité (endpoint v1/v2 "/kyc"). Même prudence que
 * checkTransactionStatus : format non confirmé, réponse ambiguë = null.
 * Volontairement PAS branché sur le parcours de paiement (un faux négatif
 * bloquerait un client légitime) — exposée pour test manuel côté admin en
 * attendant confirmation du format exact par le support MyPVit.
 */
async function checkKyc(phone, operatorCode) {
    try {
        const secret = await getSecret(operatorCode);
        const url = `${env_1.env.mypvit.baseUrl}/v2/${env_1.env.mypvit.urlCodes.kyc}/kyc`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "X-Secret": secret, Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
                customer_account_number: phone,
                customerAccountNumber: phone,
                operation_account_code: env_1.env.mypvit.accounts[operatorCode],
            }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data)
            return null;
        const verifiedRaw = data.verified ?? data.is_verified ?? data.kyc_status ?? data.status;
        if (verifiedRaw === undefined)
            return null;
        const verified = ["true", "verified", "success", "1"].includes(String(verifiedRaw).toLowerCase());
        return { verified, raw: data };
    }
    catch {
        return null;
    }
}
/**
 * Liste les opérateurs réellement disponibles sur ton compte MyPVit — permet
 * de vérifier/valider dynamiquement les operator_code plutôt que de deviner
 * (utile en particulier pour confirmer le bon code "carte Visa/Mastercard").
 * Retourne [] si l'appel échoue, plutôt que de faire planter l'appelant.
 */
async function getOperators(operatorCode) {
    try {
        const secret = await getSecret(operatorCode);
        const url = `${env_1.env.mypvit.baseUrl}/v2/${env_1.env.mypvit.urlCodes.getOperators}/get-operators`;
        const res = await fetch(url, {
            method: "GET",
            headers: { "X-Secret": secret, Accept: "application/json" },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data)
            return [];
        return Array.isArray(data) ? data : data.operators || data.data || [];
    }
    catch {
        return [];
    }
}

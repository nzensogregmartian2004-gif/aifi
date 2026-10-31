import { AppError } from "../../errors";
import { EventEmitter } from "events";
import { env, isMypvitConfigured, OperatorCode } from "../../config/env";

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

const secretEvents = new EventEmitter();
secretEvents.setMaxListeners(50);

// Comptes actuellement en attente d'un secret par webhook, dans l'ordre
// d'envoi de la demande — sert de repli quand le webhook MyPVit ne renvoie
// pas le operationAccountCode concerné (voir receiveSecretFromWebhook).
const pendingAccounts: OperatorCode[] = [];

// Un secret mis en cache PAR compte : le secret d'un compte Airtel ne doit
// jamais être envoyé avec le operationAccountCode du compte Moov (ou Carte),
// sous peine d'AUTHENTICATION_FAILED — c'est le bug du 27/08.
const cachedSecrets: Partial<Record<OperatorCode, { value: string; expiresAt: number }>> = {};

/**
 * Appelée par la route webhook quand MyPVit envoie la clé de façon
 * asynchrone. `accountCode` est le operationAccountCode renvoyé par MyPVit
 * dans le payload du webhook, s'il est présent — permet de router le secret
 * vers le bon compte quand plusieurs renouvellements sont en attente en même
 * temps. S'il est absent, on retombe sur la plus ancienne demande en attente.
 */
export function receiveSecretFromWebhook(secretValue: string, expiresInSeconds = 3000, accountCode?: string | null) {
  const expiresAt = Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000;

  let operatorCode: OperatorCode | undefined = accountCode
    ? (Object.keys(env.mypvit.accounts) as OperatorCode[]).find((op) => env.mypvit.accounts[op] === accountCode)
    : undefined;

  if (operatorCode) {
    const idx = pendingAccounts.indexOf(operatorCode);
    if (idx !== -1) pendingAccounts.splice(idx, 1);
  } else {
    operatorCode = pendingAccounts.shift();
  }

  if (!operatorCode) {
    console.warn("[mypvit] secret reçu par webhook sans demande en attente correspondante, ignoré.");
    return;
  }

  cachedSecrets[operatorCode] = { value: secretValue, expiresAt };
  secretEvents.emit(`secret:${operatorCode}`, secretValue);
}

function waitForWebhookSecret(operatorCode: OperatorCode, timeoutMs = 15000): Promise<string> {
  pendingAccounts.push(operatorCode);
  const eventName = `secret:${operatorCode}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      secretEvents.off(eventName, onSecret);
      const idx = pendingAccounts.indexOf(operatorCode);
      if (idx !== -1) pendingAccounts.splice(idx, 1);
      reject(
        new Error(
          `MyPVit n'a pas envoyé la clé secrète (compte ${operatorCode}) dans le délai imparti (15s). Vérifie que l'URL ` +
            "webhook de réception (POST /api/webhooks/mypvit/secret) est bien enregistrée dans ton espace MyPVit sous le " +
            "code MYPVIT_RECEPTION_URL_CODE, et joignable depuis internet."
        )
      );
    }, timeoutMs);
    function onSecret(value: string) {
      clearTimeout(timer);
      resolve(value);
    }
    secretEvents.once(eventName, onSecret);
  });
}

interface RenewSecretResponse {
  operation_account_code: string;
  secret: string;
  expires_in: number;
}

async function fetchNewSecret(operatorCode: OperatorCode): Promise<string> {
  const accountCode = env.mypvit.accounts[operatorCode];
  if (!accountCode) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", `Aucun operationAccountCode configuré pour ${operatorCode}.`);
  }

  const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.renewSecret}/renew-secret`;
  const body = new URLSearchParams({
    operationAccountCode: accountCode,
    password: env.mypvit.apiPassword,
    receptionUrlCode: env.mypvit.receptionUrlCode,
  });

  // On commence à écouter AVANT d'envoyer la requête : si MyPVit répond très
  // vite par webhook, on ne veut pas rater l'événement en le configurant trop tard.
  const waiter = waitForWebhookSecret(operatorCode);
  waiter.catch(() => {}); // évite un rejet de promesse non géré si la réponse immédiate suffit

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError("PROVIDER_ERROR", `MyPVit renew-secret a échoué pour ${operatorCode} (${res.status}): ${text}`);
  }

  // Selon le compte, la clé peut arriver directement dans cette réponse...
  const data = (await res.json().catch(() => null)) as RenewSecretResponse | null;
  if (data?.secret) {
    // Résolue immédiatement : on retire la demande en attente pour qu'un
    // webhook tardif ne vienne pas la consommer par erreur plus tard.
    const idx = pendingAccounts.indexOf(operatorCode);
    if (idx !== -1) pendingAccounts.splice(idx, 1);
    cachedSecrets[operatorCode] = { value: data.secret, expiresAt: Date.now() + ((data.expires_in || 3000) - 300) * 1000 };
    return cachedSecrets[operatorCode]!.value;
  }

  // ...sinon elle arrive de façon asynchrone sur le webhook de réception.
  return waiter;
}

export async function getSecret(operatorCode: OperatorCode, forceRenew = false): Promise<string> {
  if (!isMypvitConfigured(operatorCode)) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", `MyPVit n'est pas configuré pour ${operatorCode} (variable d'environnement manquante)`);
  }
  const cached = cachedSecrets[operatorCode];
  if (!forceRenew && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  return fetchNewSecret(operatorCode);
}

/** Détecte l'opérateur mobile money à partir du préfixe du numéro gabonais. */
export function detectOperator(phone: string): "AIRTEL_MONEY" | "MOOV_MONEY" | null {
  const digits = phone.replace(/\D/g, "").slice(-8); // derniers 8 chiffres du numéro local
  const prefix2 = digits.slice(0, 2);
  // Préfixes indicatifs Gabon — Airtel : 04, 05, 06 / Moov : 02, 07
  if (["04", "05", "06"].includes(prefix2)) return "AIRTEL_MONEY";
  if (["02", "07"].includes(prefix2)) return "MOOV_MONEY";
  return null;
}

interface InitiatePaymentParams {
  amount: number;
  phone: string;
  reference: string; // max 13 caractères, généré par nous
  // "VISA_MASTERCARD" suit la convention de nommage des autres opérateurs
  // (AIRTEL_MONEY, MOOV_MONEY) vue dans la doc v2, mais MyPVit n'a pas encore
  // publié la valeur exacte attendue pour les cartes sur cette version de
  // l'API — à confirmer auprès du support avant d'activer ce moyen de
  // paiement en production. Sans risque à tester : en cas de mauvaise valeur,
  // l'appel échoue proprement (pas de mouvement d'argent).
  operatorCode: "AIRTEL_MONEY" | "MOOV_MONEY" | "VISA_MASTERCARD";
  freeInfo: string;
  agent?: string;
}

interface InitiatePaymentResponse {
  status: string;
  status_code: string;
  operator: string;
  reference_id: string;
  merchant_reference_id: string;
  merchant_operation_account_code: string;
  message: string;
}

export async function initiatePayment(params: InitiatePaymentParams, retry = true): Promise<InitiatePaymentResponse> {
  const secret = await getSecret(params.operatorCode);
  const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.rest}/rest`;

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
      callback_url_code: env.mypvit.callbackUrlCode,
      customer_account_number: params.phone,
      merchant_operation_account_code: env.mypvit.accounts[params.operatorCode],
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
    const code = (data as { error?: string } | null)?.error;
    if (code === "OPERATOR_NOT_ACTIVE") {
      throw new AppError("METHOD_UNAVAILABLE", "Ce moyen de paiement n'est pas encore disponible. Choisis un autre moyen ou réessaie plus tard.");
    }
    throw new AppError("PAYMENT_START_FAILED", "Le paiement n'a pas pu être lancé. Réessaie dans quelques instants.");
  }

  return data as InitiatePaymentResponse;
}

/**
 * Génère une référence courte (≤13 caractères, exigence MyPVit) à partir d'un id.
 * Préfixe "R" (repayment) + timestamp compact + suffixe aléatoire.
 */
export function generatePaymentReference(): string {
  const base36Time = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 6);
  return `R${base36Time}${rand}`.slice(0, 13).toUpperCase();
}

/**
 * Génère une référence pour un décaissement (préfixe "G" pour give_change).
 */
export function generateDisbursementReference(): string {
  const base36Time = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 6);
  return `G${base36Time}${rand}`.slice(0, 13).toUpperCase();
}

interface GiveChangeParams {
  amount: number;
  phone: string;
  reference: string; // max 13 caractères, garantit l'idempotence
  operatorCode: "AIRTEL_MONEY" | "MOOV_MONEY";
  freeInfo: string;
  agent?: string;
}

interface GiveChangeResponse {
  status: "SUCCESS" | "FAILED" | string;
  status_code: string;
  operator: string;
  reference_id: string;
  merchant_reference_id: string;
  merchant_operation_account_code: string;
  message: string;
}

/**
 * Reverse de l'argent du compte marchand vers un client (GIVE_CHANGE).
 * Contrairement à initiatePayment, cette opération est SYNCHRONE : la réponse
 * contient directement le statut final (SUCCESS/FAILED), sans webhook.
 * `owner_charge: "MERCHANT"` — le marchand supporte les frais, pour que le
 * client reçoive bien le montant plein annoncé.
 */
export async function giveChange(params: GiveChangeParams, retry = true): Promise<GiveChangeResponse> {
  const secret = await getSecret(params.operatorCode);
  const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.rest}/rest`;

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
      merchant_operation_account_code: env.mypvit.accounts[params.operatorCode],
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
    throw new AppError("PROVIDER_ERROR", `MyPVit a refusé le décaissement (${res.status}): ${JSON.stringify(data)}`);
  }

  return data as GiveChangeResponse;
}

/**
 * Vérification de statut (Check Status), conforme à la collection Postman officielle MyPVit :
 *   GET {base}/{code_url_status}/status?transactionId=...&accountOperationCode=...&transactionOperation=PAYMENT
 * avec le seul en-tête X-Secret. `transactionId` est l'identifiant MyPVit renvoyé à l'initiation
 * (reference_id, ex. PAY23102400001), et NON notre référence marchande.
 */
export function buildStatusRequest(
  providerTransactionId: string,
  accountCode: string,
  transactionOperation: string = "PAYMENT"
): { url: string } {
  const query = new URLSearchParams({
    transactionId: providerTransactionId,
    accountOperationCode: accountCode,
    transactionOperation,
  });
  return { url: `${env.mypvit.baseUrl}/${env.mypvit.urlCodes.status}/status?${query.toString()}` };
}

/**
 * Lit le statut d'une réponse Check Status (exemple officiel : { "status": "SUCCESS", ... }).
 * Toute réponse sans statut reconnu renvoie null : on ne suppose jamais un résultat.
 */
export function parseStatusResponse(data: any): "SUCCESS" | "FAILED" | "PENDING" | null {
  const raw = (data?.status ?? data?.transaction_status ?? data?.transactionStatus ?? "").toString().toUpperCase();
  return ["SUCCESS", "FAILED", "PENDING"].includes(raw) ? (raw as "SUCCESS" | "FAILED" | "PENDING") : null;
}

export async function checkTransactionStatus(
  providerTransactionId: string,
  operatorCode: OperatorCode,
  transactionOperation: string = "PAYMENT",
  retry = true
): Promise<"SUCCESS" | "FAILED" | "PENDING" | null> {
  try {
    const accountCode = env.mypvit.accounts[operatorCode];
    if (!accountCode || !providerTransactionId) return null;
    const secret = await getSecret(operatorCode);
    const { url } = buildStatusRequest(providerTransactionId, accountCode, transactionOperation);
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Secret": secret, Accept: "application/json" },
    });
    if (res.status === 401 && retry) {
      await getSecret(operatorCode, true);
      return checkTransactionStatus(providerTransactionId, operatorCode, transactionOperation, false);
    }
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return parseStatusResponse(data);
  } catch {
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
export async function checkKyc(
  phone: string,
  operatorCode: OperatorCode
): Promise<{ verified: boolean; raw: any } | null> {
  try {
    const secret = await getSecret(operatorCode);
    const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.kyc}/kyc`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Secret": secret, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_account_number: phone,
        customerAccountNumber: phone,
        operation_account_code: env.mypvit.accounts[operatorCode],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return null;

    const verifiedRaw = data.verified ?? data.is_verified ?? data.kyc_status ?? data.status;
    if (verifiedRaw === undefined) return null;
    const verified = ["true", "verified", "success", "1"].includes(String(verifiedRaw).toLowerCase());
    return { verified, raw: data };
  } catch {
    return null;
  }
}
interface MypvitOperator {
  code: string;
  name?: string;
  country?: string;
  [key: string]: any;
}

/**
 * Liste les opérateurs réellement disponibles sur ton compte MyPVit — permet
 * de vérifier/valider dynamiquement les operator_code plutôt que de deviner
 * (utile en particulier pour confirmer le bon code "carte Visa/Mastercard").
 * Retourne [] si l'appel échoue, plutôt que de faire planter l'appelant.
 */
export async function getOperators(operatorCode: OperatorCode): Promise<MypvitOperator[]> {
  try {
    const secret = await getSecret(operatorCode);
    const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.getOperators}/get-operators`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Secret": secret, Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return [];
    return Array.isArray(data) ? data : data.operators || data.data || [];
  } catch {
    return [];
  }
}

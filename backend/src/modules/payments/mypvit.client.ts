import { EventEmitter } from "events";
import { env, isMypvitConfigured } from "../../config/env";

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

/** Appelée par la route webhook quand MyPVit envoie la clé de façon asynchrone. */
export function receiveSecretFromWebhook(secretValue: string, expiresInSeconds = 3000) {
  cachedSecret = { value: secretValue, expiresAt: Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000 };
  secretEvents.emit("secret", secretValue);
}

function waitForWebhookSecret(timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      secretEvents.off("secret", onSecret);
      reject(
        new Error(
          "MyPVit n'a pas envoyé la clé secrète dans le délai imparti (15s). Vérifie que l'URL webhook de réception " +
            "(POST /api/webhooks/mypvit/secret) est bien enregistrée dans ton espace MyPVit sous le code " +
            "MYPVIT_RECEPTION_URL_CODE, et joignable depuis internet."
        )
      );
    }, timeoutMs);
    function onSecret(value: string) {
      clearTimeout(timer);
      resolve(value);
    }
    secretEvents.once("secret", onSecret);
  });
}

let cachedSecret: { value: string; expiresAt: number } | null = null;

interface RenewSecretResponse {
  operation_account_code: string;
  secret: string;
  expires_in: number;
}

async function fetchNewSecret(): Promise<string> {
  const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.renewSecret}/renew-secret`;
  const body = new URLSearchParams({
    operationAccountCode: env.mypvit.operationAccountCode,
    password: env.mypvit.apiPassword,
    receptionUrlCode: env.mypvit.receptionUrlCode,
  });

  // On commence à écouter AVANT d'envoyer la requête : si MyPVit répond très
  // vite par webhook, on ne veut pas rater l'événement en le configurant trop tard.
  const waiter = waitForWebhookSecret();
  waiter.catch(() => {}); // évite un rejet de promesse non géré si la réponse immédiate suffit

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MyPVit renew-secret a échoué (${res.status}): ${text}`);
  }

  // Selon le compte, la clé peut arriver directement dans cette réponse...
  const data = (await res.json().catch(() => null)) as RenewSecretResponse | null;
  if (data?.secret) {
    cachedSecret = { value: data.secret, expiresAt: Date.now() + ((data.expires_in || 3000) - 300) * 1000 };
    return cachedSecret.value;
  }

  // ...sinon elle arrive de façon asynchrone sur le webhook de réception.
  return waiter;
}

export async function getSecret(forceRenew = false): Promise<string> {
  if (!isMypvitConfigured()) {
    throw new Error("MyPVit n'est pas configuré (variables d'environnement manquantes)");
  }
  if (!forceRenew && cachedSecret && cachedSecret.expiresAt > Date.now()) {
    return cachedSecret.value;
  }
  return fetchNewSecret();
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
  const secret = await getSecret();
  const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.rest}/rest`;

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
      callback_url_code: env.mypvit.callbackUrlCode,
      customer_account_number: params.phone,
      merchant_operation_account_code: env.mypvit.merchantOperationAccountCode,
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
    await getSecret(true);
    return initiatePayment(params, false);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error(`MyPVit a refusé la demande de paiement (${res.status}): ${JSON.stringify(data)}`);
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
  const secret = await getSecret();
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
      merchant_operation_account_code: env.mypvit.merchantOperationAccountCode,
      transaction_type: "GIVE_CHANGE",
      owner_charge: "MERCHANT",
      owner_charge_operator: "CUSTOMER",
      free_info: params.freeInfo,
      operator_code: params.operatorCode,
    }),
  });

  if (res.status === 401 && retry) {
    await getSecret(true);
    return giveChange(params, false);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error(`MyPVit a refusé le décaissement (${res.status}): ${JSON.stringify(data)}`);
  }

  return data as GiveChangeResponse;
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
export async function checkTransactionStatus(reference: string): Promise<"SUCCESS" | "FAILED" | "PENDING" | null> {
  try {
    const secret = await getSecret();
    const url = `${env.mypvit.baseUrl}/${env.mypvit.urlCodes.status}/status`;

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
        operation_account_code: env.mypvit.operationAccountCode,
        operationAccountCode: env.mypvit.operationAccountCode,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!data) return null;

    const status = (data.status || data.transaction_status || data.transactionStatus || "").toString().toUpperCase();
    if (["SUCCESS", "FAILED", "PENDING"].includes(status)) {
      return status as "SUCCESS" | "FAILED" | "PENDING";
    }
    return null;
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
export async function checkKyc(phone: string): Promise<{ verified: boolean; raw: any } | null> {
  try {
    const secret = await getSecret();
    const url = `${env.mypvit.baseUrl}/v2/${env.mypvit.urlCodes.kyc}/kyc`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Secret": secret, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_account_number: phone,
        customerAccountNumber: phone,
        operation_account_code: env.mypvit.operationAccountCode,
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
export async function getOperators(): Promise<MypvitOperator[]> {
  try {
    const secret = await getSecret();
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

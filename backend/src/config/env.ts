import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

/**
 * Les 3 moyens de paiement MyPVit. Confirmé le 27/08 avec Petit : ce sont
 * 3 comptes marchands MyPVit distincts (donc 3 operationAccountCode
 * différents), mais qui partagent le MÊME mot de passe API et les MÊMES
 * codes d'URL (renew-secret, rest, status, kyc...) — seul operationAccountCode
 * change d'un compte à l'autre.
 */
export type OperatorCode = "AIRTEL_MONEY" | "MOOV_MONEY" | "VISA_MASTERCARD";

export const env = {
  jwtSecret: required("JWT_SECRET"),
  port: process.env.PORT ?? "4000",
  // Réinitialisation complète des données : désactivée sauf si ALLOW_DATA_RESET=true
  allowDataReset: process.env.ALLOW_DATA_RESET === "true",
  mypvit: {
    // Pas de /v2 ici : certains endpoints l'ont dans leur propre chemin, d'autres non
    // (voir urlCodes ci-dessous, copié tel quel depuis l'espace MyPVit de Petit).
    baseUrl: process.env.MYPVIT_BASE_URL ?? "https://api.mypvit.pro",
    apiPassword: process.env.MYPVIT_API_PASSWORD ?? "",
    callbackUrlCode: process.env.MYPVIT_CALLBACK_URL_CODE ?? "",
    // Code distinct exigé par MyPVit pour renew-secret ("receptionUrlCode"),
    // différent du callback des paiements — à obtenir auprès du support
    // MyPVit (erreur INVALID_SECRET_KEY_RECEPTION_URL_CODE sinon).
    receptionUrlCode: process.env.MYPVIT_RECEPTION_URL_CODE ?? "",
    // Un operationAccountCode par compte marchand. Chaque appel (renew-secret,
    // /rest...) doit utiliser le code du compte correspondant à l'opérateur
    // utilisé pour CETTE opération précise — ne jamais mélanger un secret
    // obtenu pour un compte avec le operationAccountCode d'un autre compte
    // (c'est exactement ce qui causait l'AUTHENTICATION_FAILED du 27/08).
    accounts: {
      AIRTEL_MONEY: process.env.MYPVIT_OPERATION_ACCOUNT_CODE_AIRTEL ?? "",
      MOOV_MONEY: process.env.MYPVIT_OPERATION_ACCOUNT_CODE_MOOV ?? "",
      VISA_MASTERCARD: process.env.MYPVIT_OPERATION_ACCOUNT_CODE_CARD ?? "",
    } as Record<OperatorCode, string>,
    // Chaque fonctionnalité a son propre code d'URL chez MyPVit (visible dans
    // ton espace marchand > APIs/Urls). Aucune valeur par défaut : les codes viennent des variables d'environnement.
    // Communs aux 3 comptes (confirmé le 27/08).
    urlCodes: {
      renewSecret: process.env.MYPVIT_URLCODE_RENEW_SECRET ?? "",
      rest: process.env.MYPVIT_URLCODE_REST ?? "", // v2
      link: process.env.MYPVIT_URLCODE_LINK ?? "", // v1
      balance: process.env.MYPVIT_URLCODE_BALANCE ?? "", // v1
      status: process.env.MYPVIT_URLCODE_STATUS ?? "", // v1
      kyc: process.env.MYPVIT_URLCODE_KYC ?? "", // v1v2
      getFees: process.env.MYPVIT_URLCODE_GET_FEES ?? "", // v2
      generateQrCode: process.env.MYPVIT_URLCODE_QR_CODE ?? "", // v2
      getOperators: process.env.MYPVIT_URLCODE_GET_OPERATORS ?? "", // v2
      getCountries: process.env.MYPVIT_URLCODE_GET_COUNTRIES ?? "", // v2
      health: process.env.MYPVIT_URLCODE_HEALTH ?? "", // v1
    },
  },
};

/**
 * Sans argument : vrai si MyPVit est utilisable pour AU MOINS un compte
 * (sert au démarrage du scheduler). Avec un operatorCode précis : vrai
 * uniquement si CE compte a son operationAccountCode renseigné.
 */
export function isMypvitConfigured(operatorCode?: OperatorCode) {
  const c = env.mypvit;
  if (!c.apiPassword || !c.callbackUrlCode) return false;
  if (operatorCode) return !!c.accounts[operatorCode];
  return Object.values(c.accounts).some(Boolean);
}

/** Liste les opérateurs pour lesquels un operationAccountCode est configuré. */
export function configuredOperators(): OperatorCode[] {
  return (Object.keys(env.mypvit.accounts) as OperatorCode[]).filter((op) => !!env.mypvit.accounts[op]);
}

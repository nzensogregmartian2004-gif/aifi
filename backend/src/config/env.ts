import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

export const env = {
  jwtSecret: required("JWT_SECRET"),
  port: process.env.PORT ?? "4000",
  mypvit: {
    // Pas de /v2 ici : certains endpoints l'ont dans leur propre chemin, d'autres non
    // (voir urlCodes ci-dessous, copié tel quel depuis l'espace MyPVit de Petit).
    baseUrl: process.env.MYPVIT_BASE_URL ?? "https://api.mypvit.pro",
    operationAccountCode: process.env.MYPVIT_OPERATION_ACCOUNT_CODE ?? "",
    apiPassword: process.env.MYPVIT_API_PASSWORD ?? "",
    callbackUrlCode: process.env.MYPVIT_CALLBACK_URL_CODE ?? "",
    merchantOperationAccountCode: process.env.MYPVIT_MERCHANT_OPERATION_ACCOUNT_CODE ?? process.env.MYPVIT_OPERATION_ACCOUNT_CODE ?? "",
    // Chaque fonctionnalité a son propre code d'URL chez MyPVit (visible dans
    // ton espace marchand > APIs/Urls). Valeurs par défaut = tes identifiants
    // TEST fournis le 29/07 — à remplacer par les valeurs PROD avant mise en ligne.
    urlCodes: {
      renewSecret: process.env.MYPVIT_URLCODE_RENEW_SECRET ?? "9VCHPQMFO4542SUG",
      rest: process.env.MYPVIT_URLCODE_REST ?? "0E8DCB0QOXRCNFPM", // v2
      link: process.env.MYPVIT_URLCODE_LINK ?? "GH4R5CPIPI8ANM14", // v1
      balance: process.env.MYPVIT_URLCODE_BALANCE ?? "6XRS67SYCRCLXKXN", // v1
      status: process.env.MYPVIT_URLCODE_STATUS ?? "ZBNNQXIRFGS7CLNS", // v1
      kyc: process.env.MYPVIT_URLCODE_KYC ?? "DEO0JJEILZC72A6B", // v1v2
      getFees: process.env.MYPVIT_URLCODE_GET_FEES ?? "JWJPX7ZEEZFCPLZZ", // v2
      generateQrCode: process.env.MYPVIT_URLCODE_QR_CODE ?? "DUARHQSUTDLFRV7P", // v2
      getOperators: process.env.MYPVIT_URLCODE_GET_OPERATORS ?? "LS6THSJGSZMZIDGX", // v2
      getCountries: process.env.MYPVIT_URLCODE_GET_COUNTRIES ?? "OTVFWSYOLDA1BKCB", // v2
      health: process.env.MYPVIT_URLCODE_HEALTH ?? "2QVWMAW4PLS8BFES", // v1
    },
  },
};

export function isMypvitConfigured() {
  const c = env.mypvit;
  return !!(c.operationAccountCode && c.apiPassword && c.callbackUrlCode);
}

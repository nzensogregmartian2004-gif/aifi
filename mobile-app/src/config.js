// Adapte cette URL à ton environnement :
// - Émulateur Android : http://10.0.2.2:4000/api
// - Simulateur iOS : http://localhost:4000/api
// - Téléphone physique (Expo Go) : http://<IP_LOCALE_DE_TON_ORDI>:4000/api
// - Serveur déployé : https://ton-domaine.com/api
export const API_URL = "http://localhost:4000/api";

// Racine du serveur (sans /api), utilisée pour afficher les images uploadées
// (justificatifs, pièces jointes de messagerie) dont l'URL renvoyée par le
// backend est du type "/uploads/xxx.jpg".
export const API_ROOT = API_URL.replace(/\/api\/?$/, "");

export function assetUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_ROOT}${url}`;
}

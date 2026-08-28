// Adapte cette URL à ton environnement :
// - Émulateur Android : http://10.0.2.2:4000/api
// - Simulateur iOS : http://localhost:4000/api
// - Téléphone physique (Expo Go) : http://<IP_LOCALE_DE_TON_ORDI>:4000/api
// - Serveur déployé : https://ton-domaine.com/api
export const API_URL = "https://aifi.onrender.com/api";

// Racine du serveur (sans /api), utilisée pour afficher les images uploadées
// (justificatifs, pièces jointes de messagerie) dont l'URL renvoyée par le
// backend est du type "/uploads/xxx.jpg".
export const API_ROOT = API_URL.replace(/\/api\/?$/, "");

export function assetUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_ROOT}${url}`;
}

// Les fichiers uploadés (/uploads/xxx.jpg) sont désormais servis derrière une
// authentification (voir uploads.serve.routes.ts côté backend) : il faut donc
// joindre le token dans l'en-tête Authorization pour que <Image> puisse les
// charger. À utiliser à la place de assetUrl() partout où on affiche une image
// uploadée (pièce d'identité, selfie, justificatif...).
export async function authedAssetSource(url) {
  if (!url) return null;
  const uri = assetUrl(url);
  if (uri.startsWith(API_ROOT) === false) return { uri }; // URL externe (http complet) : pas de token à joindre
  const AsyncStorage =
    require("@react-native-async-storage/async-storage").default;
  const { TOKEN_KEY } = require("./api/client");
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return {
    uri,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  };
}

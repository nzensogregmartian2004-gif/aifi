import rateLimit from "express-rate-limit";

// Anti-flood générique par IP : évite qu'un script tape l'API en boucle,
// quel que soit le numéro visé.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20, // 20 tentatives / IP / 15 min, tous numéros confondus
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de connexion. Réessaie dans quelques minutes." },
});

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives d'inscription depuis cet appareil. Réessaie plus tard." },
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRateLimiter = exports.loginRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Anti-flood générique par IP : évite qu'un script tape l'API en boucle,
// quel que soit le numéro visé.
exports.loginRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 20, // 20 tentatives / IP / 15 min, tous numéros confondus
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de tentatives de connexion. Réessaie dans quelques minutes." },
});
exports.registerRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1h
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de tentatives d'inscription depuis cet appareil. Réessaie plus tard." },
});

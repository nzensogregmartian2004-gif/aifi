"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePushEnabled = parsePushEnabled;
const errors_1 = require("../../errors");
/**
 * Lit le réglage envoyé par l'application : `pushEnabled` doit être un booléen strict.
 * `"true"`, `1` ou un champ absent sont refusés, pour ne jamais activer les push par erreur.
 */
function parsePushEnabled(body) {
    const value = body?.pushEnabled;
    if (typeof value !== "boolean") {
        throw new errors_1.AppError("INVALID_SETTING", "Valeur attendue : pushEnabled (true ou false)");
    }
    return value;
}

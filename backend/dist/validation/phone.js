"use strict";
/**
 * Source unique du format des numéros de téléphone. Utilisée par l'inscription,
 * la connexion, le seed, les scripts de maintenance et la recherche d'un compte.
 *
 * Forme canonique gabonaise : « 0 » + 8 chiffres, ex. 077000000.
 * Toutes ces saisies donnent 077000000 :
 *   077000000 · 77000000 · +24177000000 · +241 077 00 00 00 · 00241 77 00 00 00 · 241077000000
 *
 * Les numéros d'autres pays gardent leur indicatif : +33612345678.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.canonicalStoredPhone = canonicalStoredPhone;
const GABON_CODE = "241";
// Les 8 derniers chiffres sont le numéro d'abonné, quel que soit le « 0 » de trunk
// qui a pu être ajouté après l'indicatif.
function gabonLocal(rest) {
    if (rest.length < 8)
        return `+${GABON_CODE}${rest}`; // trop court : rejeté par la validation
    return "0" + rest.slice(-8);
}
/** Forme canonique d'une saisie utilisateur ou d'un numéro reçu. */
function normalizePhone(raw) {
    const digits = raw.replace(/[^\d+]/g, "");
    let international = null;
    if (digits.startsWith("+"))
        international = digits.slice(1);
    else if (digits.startsWith("00"))
        international = digits.slice(2);
    if (international !== null) {
        if (international.startsWith(GABON_CODE))
            return gabonLocal(international.slice(GABON_CODE.length));
        return "+" + international;
    }
    // Sans indicatif
    if (digits.startsWith(GABON_CODE) && digits.length >= 11)
        return gabonLocal(digits.slice(GABON_CODE.length));
    if (digits.length === 8)
        return "0" + digits;
    return digits;
}
/**
 * Forme canonique d'un numéro DÉJÀ STOCKÉ. Ajoute un cas hérité : l'ancienne
 * normalisation produisait « 0077000000 » pour +241 077000000.
 */
function canonicalStoredPhone(stored) {
    if (/^00\d{8}$/.test(stored))
        return "0" + stored.slice(-8);
    return normalizePhone(stored);
}

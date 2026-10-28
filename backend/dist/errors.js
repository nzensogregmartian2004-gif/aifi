"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorBody = errorBody;
/**
 * Erreur métier avec un code stable et des paramètres. Le serveur renvoie le message
 * français (repli) ; l'application traduit à partir du code.
 */
class AppError extends Error {
    constructor(code, message, params) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.params = params;
    }
}
exports.AppError = AppError;
/** Corps de réponse d'erreur : message (repli), code et paramètres. */
function errorBody(err) {
    return {
        error: err?.message ?? "Une erreur est survenue.",
        code: err?.code,
        params: err?.params,
    };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSerializationConflict = isSerializationConflict;
exports.withSerializationRetry = withSerializationRetry;
/**
 * Conflit de transaction Serializable (écritures concurrentes sur la même ligne) : PostgreSQL
 * annule une des transactions, il suffit de la rejouer. Ne réessaie que ce cas précis.
 */
function isSerializationConflict(err) {
    return (err?.code === "P2034" ||
        err?.code === "40001" ||
        /could not serialize access|write conflict/i.test(String(err?.message ?? "")));
}
async function withSerializationRetry(fn, attempts = 3) {
    for (let attempt = 1;; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            if (!isSerializationConflict(err) || attempt >= attempts)
                throw err;
            await new Promise((r) => setTimeout(r, 100 * attempt + Math.floor(Math.random() * 100)));
        }
    }
}

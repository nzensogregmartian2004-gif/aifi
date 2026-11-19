"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_DIR = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
// En production, UPLOAD_DIR pointe vers le disque persistant Render (ex. /var/data/uploads).
// Sans cette variable, on garde l'ancien comportement (dossier uploads/ du projet).
const uploadDir = process.env.UPLOAD_DIR?.trim() || path_1.default.join(process.cwd(), "uploads");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// Extension déduite du type MIME (et non du nom fourni par le client) : un
// fichier "x.html" envoyé comme image/png ne peut plus être servi comme HTML.
const EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
};
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = EXT_BY_MIME[file.mimetype] ?? ".bin";
        cb(null, `${Date.now()}-${crypto_1.default.randomBytes(8).toString("hex")}${ext}`);
    },
});
function fileFilter(_req, file, cb) {
    if (!EXT_BY_MIME[file.mimetype]) {
        return cb(new Error("Format non accepté : JPEG, PNG, WebP, GIF, HEIC ou HEIF uniquement."));
    }
    cb(null, true);
}
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max
});
exports.UPLOAD_DIR = uploadDir;

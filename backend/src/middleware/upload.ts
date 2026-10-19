import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// En production, UPLOAD_DIR pointe vers le disque persistant Render (ex. /var/data/uploads).
// Sans cette variable, on garde l'ancien comportement (dossier uploads/ du projet).
const uploadDir = process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Extension déduite du type MIME (et non du nom fourni par le client) : un
// fichier "x.html" envoyé comme image/png ne peut plus être servi comme HTML.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] ?? ".bin";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!EXT_BY_MIME[file.mimetype]) {
    return cb(new Error("Format non accepté : JPEG, PNG, WebP, GIF, HEIC ou HEIF uniquement."));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max
});

export const UPLOAD_DIR = uploadDir;

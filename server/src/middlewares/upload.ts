import multer from "multer";
import path from "node:path";
import fs from "node:fs";

const uploadDir = path.join(process.cwd(), "uploads", "profiles");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname}`.replace(/\s+/g, "-");
    cb(null, safeName);
  }
});

export const profileUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image uploads are allowed"));
  }
});

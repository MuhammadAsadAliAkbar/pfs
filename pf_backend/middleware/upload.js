const multer = require("multer");
const path = require("path");
const fs = require("fs");

const MAX_SIZE_MB = 5;

// ===== Folder path =====
// Project root ke andar: <project>/uploads/images
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "images");

// Folder na ho to automatically bana do
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ===== Disk storage =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG and WEBP images are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024, files: 1 },
});

// Multer ke errors ko clean JSON me return karne ke liye
const uploadSingle = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `File too large. Max ${MAX_SIZE_MB}MB allowed`
          : err.message;
      return res.status(400).json({ success: false, message });
    }

    return res.status(400).json({ success: false, message: err.message });
  });
};

module.exports = { upload, uploadSingle, UPLOAD_DIR };
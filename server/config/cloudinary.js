// config/cloudinary.js
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const path = require("path");

// Configure Cloudinary using env vars
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CloudinaryStorage configuration
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    // sanitize original name and create predictable public_id
    const orig = file.originalname || "file";
    const base = path.parse(orig).name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    const timestamp = Date.now();
    const public_id = `techstore/${base}-${timestamp}`;

    return {
      folder: "techstore",
      public_id,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      format: "auto",      // let Cloudinary auto-select best format
      // optional default transformation for upload (you can omit)
      // transformation: [{ quality: "auto" }],
    };
  },
});

// Multer fileFilter - allow only image mimetypes (extra extension check not required here)
const fileFilter = (req, file, cb) => {
  if (/^image\//.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

// Multer upload instance with size limit + fileFilter
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB per file (adjust as needed)
  fileFilter,
});

module.exports = { cloudinary, upload };

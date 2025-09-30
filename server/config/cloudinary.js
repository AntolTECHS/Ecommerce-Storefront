// config/cloudinary.js
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// Configure Cloudinary using env vars
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CloudinaryStorage configuration
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "techstore", // change if you want a different folder
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    // You can also set transformation presets here if desired, e.g.:
    // transformation: [{ width: 1200, crop: "limit" }]
  },
});

// Multer fileFilter - allow only image mimetypes
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file (adjust as needed)
  fileFilter,
});

module.exports = { cloudinary, upload };

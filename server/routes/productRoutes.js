// routes/productRoutes.js
const express = require("express");
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { protect, admin } = require("../middleware/authMiddleware");

// Cloudinary-backed multer upload (must export `upload` from ../config/cloudinary)
const { upload } = require("../config/cloudinary");

const router = express.Router();

/**
 * Public routes
 *
 * GET /api/products
 * - supports ?page=1&limit=20 (normalized below)
 */
router.get("/", (req, res, next) => {
  // Normalize page & limit early so downstream controller can rely on valid values on req.query
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  // clamp values to sane ranges
  req.query.page = Math.max(1, page);
  req.query.limit = Math.min(100, Math.max(1, limit));

  return getProducts(req, res, next);
});

router.get("/:id", getProductById);

/**
 * Admin routes (images uploaded directly to Cloudinary)
 * - upload.array("images") accepts up to default limit configured in your Cloudinary storage
 */
router.post("/", protect, admin, upload.array("images"), createProduct);
router.put("/:id", protect, admin, upload.array("images"), updateProduct);
router.delete("/:id", protect, admin, deleteProduct);

module.exports = router;

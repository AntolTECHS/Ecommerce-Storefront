// routes/upload.js
const express = require('express');
const router = express.Router();
const { uploadImages, addProductImages } = require('../controllers/uploadController');

// adapt the auth middleware import to your project:
const { protect } = require('../middleware/authMiddleware'); // <--- change path/name if different

// Upload images for a product: POST /api/upload/products/:id
router.post('/products/:id', protect, uploadImages, addProductImages);

module.exports = router;

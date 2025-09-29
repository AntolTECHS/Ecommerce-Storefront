// controllers/uploadController.js
const path = require('path');
const Product = require('../models/Product');
const multer = require('multer');

// Disk storage to uploads directory (ensure app.js already creates uploads/)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: function (req, file, cb) {
    // keep original extension, create unique name
    const ext = path.extname(file.originalname) || '';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

// simple image file filter
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// Middleware to handle multiple images: use upload.array('images', 8) in route
const uploadImages = upload.array('images', 8);

const addProductImages = async (req, res) => {
  try {
    const productId = req.params.id;
    const files = req.files || [];
    if (!productId) return res.status(400).json({ message: 'Product id required' });
    if (!files.length) return res.status(400).json({ message: 'No files uploaded' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Build canonical URLs (uses trust proxy in app.js so req.protocol is correct behind proxies)
    const host = req.get && req.get('host') ? req.get('host') : 'localhost:5000';
    const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : req.protocol;
    const origin = `${proto}://${host}`.replace(/\/+$/, '');

    const newUrls = files.map((f) => `${origin}/uploads/${f.filename}`); // absolute URLs
    // Alternatively, you could store relative paths: `/uploads/${f.filename}`

    // Append to product.images and save
    product.images = Array.isArray(product.images) ? product.images.concat(newUrls) : newUrls;
    if (!product.image && product.images.length) product.image = product.images[0];
    await product.save();

    return res.status(200).json({ message: 'Images uploaded', images: newUrls });
  } catch (err) {
    console.error('addProductImages err', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

module.exports = { uploadImages, addProductImages };

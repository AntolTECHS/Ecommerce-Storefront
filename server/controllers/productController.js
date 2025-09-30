// controllers/productController.js
'use strict';

const Product = require('../models/Product');

/**
 * Helper: normalize image paths to full URLs
 * - Accepts absolute URLs (http/https), protocol-relative (//host/path) and relative paths.
 * - Ensures returned values are absolute URLs when possible.
 */
const buildImageUrls = (req, images) => {
  if (!images || !Array.isArray(images) || images.length === 0) return [];
  return images
    .map((img) => {
      if (!img) return null;
      const s = String(img).trim();
      if (!s) return null;
      // already absolute
      if (/^https?:\/\//i.test(s)) return s;
      // protocol-relative (//cdn.example.com/...)
      if (s.startsWith('//')) return `${req.protocol}:${s}`;
      // otherwise ensure leading slash and prefix host
      const path = s.startsWith('/') ? s : `/${s}`;
      return `${req.protocol}://${req.get('host')}${path}`;
    })
    .filter(Boolean);
};

/**
 * Helper: pick primary image (first in images array) or fallback to `product.image` if present.
 */
const pickPrimaryImage = (req, images, fallback) => {
  const imgs = buildImageUrls(req, images);
  if (imgs.length) return imgs[0];
  if (fallback && typeof fallback === 'string') {
    const s = fallback.trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `${req.protocol}:${s}`;
    const path = s.startsWith('/') ? s : `/${s}`;
    return `${req.protocol}://${req.get('host')}${path}`;
  }
  return null;
};

/**
 * Utility: parse `images` value that might be an array, JSON string, or CSV string.
 */
const parseImagesField = (imagesField) => {
  if (typeof imagesField === 'undefined' || imagesField === null) return undefined;
  if (Array.isArray(imagesField)) return imagesField;
  if (typeof imagesField === 'string') {
    const trimmed = imagesField.trim();
    if (!trimmed) return [];
    // try JSON.parse
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // ignore JSON parse error
    }
    // treat as CSV
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
};

// @desc Get all products
// @route GET /api/products
// @access Public
const getProducts = async (req, res) => {
  try {
    const products = await Product.find({});
    const productsWithFullUrls = products.map((p) => {
      const imgs = buildImageUrls(req, p.images);
      return {
        ...p._doc,
        images: imgs,
        image: imgs.length ? imgs[0] : (p.image ? pickPrimaryImage(req, [], p.image) : null),
      };
    });
    res.json(productsWithFullUrls);
  } catch (error) {
    console.error('getProducts error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get single product
// @route GET /api/products/:id
// @access Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      const imgs = buildImageUrls(req, product.images);
      res.json({
        ...product._doc,
        images: imgs,
        image: imgs.length ? imgs[0] : (product.image ? pickPrimaryImage(req, [], product.image) : null),
      });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    console.error('getProductById error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Create product
// @route POST /api/products
// @access Admin
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;

    // Build image paths:
    // - prefer uploaded files (Cloudinary via multer-storage-cloudinary), extracting the URL
    // - otherwise allow `images` from body (array, JSON string, CSV)
    let imagesFromFiles = [];
    if (req.files && Array.isArray(req.files) && req.files.length) {
      imagesFromFiles = req.files
        .map((file) => file.path || file.url || file.secure_url || file.location) // handle common field names
        .filter(Boolean);
    }

    const bodyImages = parseImagesField(req.body.images);
    const images = imagesFromFiles.length ? imagesFromFiles : (Array.isArray(bodyImages) ? bodyImages : []);

    const product = new Product({
      name,
      description,
      price,
      category,
      stock,
      images,
    });

    const createdProduct = await product.save();
    const imgs = buildImageUrls(req, createdProduct.images);

    res.status(201).json({
      ...createdProduct._doc,
      images: imgs,
      image: imgs.length ? imgs[0] : null,
    });
  } catch (error) {
    console.error('❌ Error in createProduct:', error && error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc Update product
// @route PUT /api/products/:id
// @access Admin
const updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
      product.name = name ?? product.name;
      product.description = description ?? product.description;
      product.price = price ?? product.price;
      product.category = category ?? product.category;
      product.stock = stock ?? product.stock;

      // If client sends an `images` field explicitly, treat it as authoritative:
      // - if provided it will replace the product.images (even an empty array to clear)
      const bodyImages = parseImagesField(req.body.images);
      if (typeof bodyImages !== 'undefined') {
        product.images = bodyImages;
      }

      // If files were uploaded (Cloudinary), append their URLs to product.images
      if (req.files && Array.isArray(req.files) && req.files.length) {
        const newFromFiles = req.files
          .map((file) => file.path || file.url || file.secure_url || file.location)
          .filter(Boolean);

        // append to existing images array (prevents accidental overwrite)
        product.images = Array.isArray(product.images) ? product.images.concat(newFromFiles) : newFromFiles;
      }

      const updatedProduct = await product.save();
      const imgs = buildImageUrls(req, updatedProduct.images);

      res.json({
        ...updatedProduct._doc,
        images: imgs,
        image: imgs.length ? imgs[0] : (updatedProduct.image ? pickPrimaryImage(req, [], updatedProduct.image) : null),
      });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    console.error('updateProduct error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Delete product
// @route DELETE /api/products/:id
// @access Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      // OPTIONAL: if you stored Cloudinary public IDs, you could remove images from Cloudinary here.
      // e.g. cloudinary.uploader.destroy(publicId)
      // But since we store URLs, you'd need to store public IDs separately to delete.
      await product.deleteOne();
      res.json({ message: 'Product removed' });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    console.error('deleteProduct error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};

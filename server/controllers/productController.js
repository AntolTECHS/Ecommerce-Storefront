// controllers/productController.js
'use strict';

const Product = require('../models/Product');
const { cloudinary } = require('../config/cloudinary'); // ensure this exports cloudinary
const url = require('url');

/**
 * Helper: normalize image entries (string or object) to absolute URLs
 * Accepts:
 *  - image strings (absolute or relative)
 *  - image objects { url, public_id }
 */
const buildImageUrls = (req, images) => {
  if (!images || !Array.isArray(images) || images.length === 0) return [];
  return images
    .map((img) => {
      if (!img) return null;

      // if object, prefer its url prop
      const raw = typeof img === 'object' ? (img.url || '') : String(img);
      const s = String(raw).trim();
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
 * Accepts images as array of strings or objects.
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
 * parseImagesField: accept array | JSON string | CSV string and normalize to array
 * Returns undefined if field not provided.
 */
const parseImagesField = (imagesField) => {
  if (typeof imagesField === 'undefined' || imagesField === null) return undefined;
  if (Array.isArray(imagesField)) return imagesField;
  if (typeof imagesField === 'string') {
    const trimmed = imagesField.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // not JSON
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
};

/**
 * Convert uploaded file (multer/cloudinary) into { url, public_id } object
 * Handles common fields set by multer-storage-cloudinary: path, secure_url, url, location, filename, public_id
 */
const fileToImageObject = (file) => {
  if (!file) return null;
  const imgUrl = file.path || file.secure_url || file.url || file.location || null;
  const public_id = file.filename || file.public_id || null;
  if (!imgUrl) return null;
  return { url: imgUrl, public_id };
};

/* ================== CONTROLLERS ================== */

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
        // Keep stored structure (objects) but return URL strings for convenience in `images` field
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
    // optional debug logging (remove or reduce in production)
    console.log('createProduct req.body keys:', Object.keys(req.body || {}));
    if (req.files) {
      console.log('createProduct req.files count:', Array.isArray(req.files) ? req.files.length : 'not-array');
    }

    const { name, description, price, category, stock } = req.body;

    // images from uploaded files (Cloudinary)
    let imagesFromFiles = [];
    if (Array.isArray(req.files) && req.files.length) {
      imagesFromFiles = req.files.map(fileToImageObject).filter(Boolean);
    }

    // images from body (strings or objects)
    const bodyImagesRaw = parseImagesField(req.body.images);
    let bodyImages = undefined;
    if (typeof bodyImagesRaw !== 'undefined') {
      bodyImages = bodyImagesRaw.map((i) => {
        if (!i) return null;
        if (typeof i === 'string') return { url: i, public_id: null };
        if (typeof i === 'object' && i.url) return { url: i.url, public_id: i.public_id || null };
        return null;
      }).filter(Boolean);
    }

    // Prefer uploaded files (if any), otherwise body images
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
    console.error('❌ createProduct error:', error && error.stack ? error.stack : error);
    const payload = { message: error.message };
    if (process.env.NODE_ENV === 'development') payload.stack = error.stack;
    res.status(500).json(payload);
  }
};

// @desc Update product
// @route PUT /api/products/:id
// @access Admin
const updateProduct = async (req, res) => {
  try {
    console.log('updateProduct id:', req.params.id);
    console.log('updateProduct body keys:', Object.keys(req.body || {}));
    if (req.files) console.log('updateProduct files:', Array.isArray(req.files) ? req.files.length : 'not-array');

    const { name, description, price, category, stock } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.name = name ?? product.name;
    product.description = description ?? product.description;
    product.price = price ?? product.price;
    product.category = category ?? product.category;
    product.stock = stock ?? product.stock;

    // If `images` provided explicitly in body -> authoritative replacement
    const bodyImagesRaw = parseImagesField(req.body.images);
    if (typeof bodyImagesRaw !== 'undefined') {
      const normalizedBodyImages = bodyImagesRaw.map((i) => {
        if (!i) return null;
        if (typeof i === 'string') return { url: i, public_id: null };
        if (typeof i === 'object' && i.url) return { url: i.url, public_id: i.public_id || null };
        return null;
      }).filter(Boolean);
      product.images = normalizedBodyImages;
    }

    // Append newly uploaded files (if any)
    if (Array.isArray(req.files) && req.files.length) {
      const newFromFiles = req.files.map(fileToImageObject).filter(Boolean);
      product.images = Array.isArray(product.images) ? product.images.concat(newFromFiles) : newFromFiles;
    }

    const updatedProduct = await product.save();
    const imgs = buildImageUrls(req, updatedProduct.images);

    res.json({
      ...updatedProduct._doc,
      images: imgs,
      image: imgs.length ? imgs[0] : (updatedProduct.image ? pickPrimaryImage(req, [], updatedProduct.image) : null),
    });
  } catch (error) {
    console.error('updateProduct error:', error && error.stack ? error.stack : error);
    const payload = { message: error.message };
    if (process.env.NODE_ENV === 'development') payload.stack = error.stack;
    res.status(500).json(payload);
  }
};

// @desc Delete product
// @route DELETE /api/products/:id
// @access Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ message: 'Product not found' });

    // If product.images contain public_id values, try to remove them from Cloudinary
    if (Array.isArray(product.images) && product.images.length) {
      for (const img of product.images) {
        try {
          const publicId = (typeof img === 'object' ? img.public_id : null) || null;
          if (publicId && cloudinary && typeof cloudinary.uploader.destroy === 'function') {
            // destroy returns a promise
            await cloudinary.uploader.destroy(publicId);
            console.log('Cloudinary destroyed public_id:', publicId);
          }
        } catch (err) {
          // log and continue; don't block delete if Cloudinary remove fails
          console.warn('Cloudinary destroy failed for image:', img, err && err.message ? err.message : err);
        }
      }
    }

    await product.deleteOne();
    res.json({ message: 'Product removed' });
  } catch (error) {
    console.error('deleteProduct error:', error && error.stack ? error.stack : error);
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

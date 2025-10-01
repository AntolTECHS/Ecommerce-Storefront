// controllers/productController.js
'use strict';

const Product = require('../models/Product');
const { cloudinary } = require('../config/cloudinary');

/**
 * Helper: normalize image entries (string or object) to absolute URLs
 */
const buildImageUrls = (req, images) => {
  if (!images || !Array.isArray(images) || images.length === 0) return [];
  return images
    .map((img) => {
      if (!img) return null;
      const raw = typeof img === 'object' ? (img.url || '') : String(img);
      const s = String(raw).trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) return s;
      if (s.startsWith('//')) return `${req.protocol}:${s}`;
      const path = s.startsWith('/') ? s : `/${s}`;
      return `${req.protocol}://${req.get('host')}${path}`;
    })
    .filter(Boolean);
};

/**
 * Helper: pick primary image
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
 * parseImagesField: accept array | JSON string | CSV string
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
    } catch (_) {}
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
};

/**
 * Convert uploaded file -> { url, public_id }
 */
const fileToImageObject = (file) => {
  if (!file) return null;
  const imgUrl = file.path || file.secure_url || file.url || file.location || null;
  const public_id = file.filename || file.public_id || null;
  if (!imgUrl) return null;
  return { url: imgUrl, public_id };
};

/**
 * Cloudinary URL transformer
 */
const transformCloudinaryUrl = (urlStr, { width, height, crop = 'fill', quality = 'auto', format = 'auto' } = {}) => {
  if (!urlStr || typeof urlStr !== 'string') return urlStr;
  try {
    if (!/res\.cloudinary\.com/i.test(urlStr) || !urlStr.includes('/upload/')) return urlStr;
    const parts = [];
    if (width) parts.push(`w_${width}`);
    if (height) parts.push(`h_${height}`);
    if (crop) parts.push(`c_${crop}`);
    if (quality) parts.push(`q_${quality}`);
    if (format) parts.push(`f_${format}`);
    const transformation = parts.length ? parts.join(',') + '/' : '';
    return urlStr.replace('/upload/', `/upload/${transformation}`);
  } catch {
    return urlStr;
  }
};

/* ================== CONTROLLERS ================== */

// @desc Get products (paginated)
// @route GET /api/products
const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(),
    ]);

    const productsWithFullUrls = products.map((p) => {
      const imgs = buildImageUrls(req, p.images);
      const thumbnails = imgs.map((u) => transformCloudinaryUrl(u, { width: 400, height: 400, crop: 'fill' }));

      return {
        _id: p._id,
        name: p.name,
        description: p.description && p.description.trim() !== ''
          ? p.description
          : 'No description provided', // ✅ normalize description
        price: p.price,
        category: p.category,
        stock: p.stock,
        rating: p.rating ?? 0,
        numReviews: p.numReviews ?? 0,
        images: thumbnails,
        image: thumbnails.length ? thumbnails[0] : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    res.json({
      products: productsWithFullUrls,
      page,
      pages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    console.error('getProducts error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get single product
// @route GET /api/products/:id
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const imgs = buildImageUrls(req, product.images);
    const optimized = imgs.map((u) => transformCloudinaryUrl(u, { width: 1200, quality: 'auto' }));

    res.json({
      _id: product._id,
      name: product.name,
      description: product.description && product.description.trim() !== ''
        ? product.description
        : 'No description provided', // ✅ normalize description here too
      price: product.price,
      category: product.category,
      stock: product.stock,
      rating: product.rating ?? 0,
      numReviews: product.numReviews ?? 0,
      images: optimized,
      image: optimized.length ? optimized[0] : null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    });
  } catch (error) {
    console.error('getProductById error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Create product
// @route POST /api/products
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;

    let imagesFromFiles = [];
    if (Array.isArray(req.files) && req.files.length) {
      imagesFromFiles = req.files.map(fileToImageObject).filter(Boolean);
    }

    const bodyImagesRaw = parseImagesField(req.body.images);
    let bodyImages;
    if (typeof bodyImagesRaw !== 'undefined') {
      bodyImages = bodyImagesRaw.map((i) =>
        typeof i === 'string'
          ? { url: i, public_id: null }
          : (i && i.url ? { url: i.url, public_id: i.public_id || null } : null)
      ).filter(Boolean);
    }

    const images = imagesFromFiles.length ? imagesFromFiles : (bodyImages || []);

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
      ...createdProduct.toObject(),
      images: imgs,
      image: imgs.length ? imgs[0] : null,
    });
  } catch (error) {
    console.error('❌ createProduct error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Update product
// @route PUT /api/products/:id
const updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.name = name ?? product.name;
    product.description = description ?? product.description;
    product.price = price ?? product.price;
    product.category = category ?? product.category;
    product.stock = stock ?? product.stock;

    const bodyImagesRaw = parseImagesField(req.body.images);
    if (typeof bodyImagesRaw !== 'undefined') {
      product.images = bodyImagesRaw.map((i) =>
        typeof i === 'string'
          ? { url: i, public_id: null }
          : (i && i.url ? { url: i.url, public_id: i.public_id || null } : null)
      ).filter(Boolean);
    }

    if (Array.isArray(req.files) && req.files.length) {
      const newFromFiles = req.files.map(fileToImageObject).filter(Boolean);
      product.images = Array.isArray(product.images) ? product.images.concat(newFromFiles) : newFromFiles;
    }

    const updatedProduct = await product.save();
    const imgs = buildImageUrls(req, updatedProduct.images);

    res.json({
      ...updatedProduct.toObject(),
      images: imgs,
      image: imgs.length ? imgs[0] : (updatedProduct.image ? pickPrimaryImage(req, [], updatedProduct.image) : null),
    });
  } catch (error) {
    console.error('updateProduct error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Delete product
// @route DELETE /api/products/:id
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (Array.isArray(product.images) && product.images.length) {
      for (const img of product.images) {
        try {
          const publicId = (typeof img === 'object' ? img.public_id : null) || null;
          if (publicId && cloudinary?.uploader?.destroy) {
            await cloudinary.uploader.destroy(publicId);
            console.log('Cloudinary destroyed public_id:', publicId);
          }
        } catch (err) {
          console.warn('Cloudinary destroy failed for image:', img, err.message || err);
        }
      }
    }

    await product.deleteOne();
    res.json({ message: 'Product removed' });
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

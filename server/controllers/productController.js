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

    // Build image paths if files uploaded
    const images = req.files ? req.files.map((file) => `/uploads/${file.filename}`) : [];

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
    const { name, description, price, category, stock, images } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
      product.name = name ?? product.name;
      product.description = description ?? product.description;
      product.price = price ?? product.price;
      product.category = category ?? product.category;
      product.stock = stock ?? product.stock;

      // prefer explicit images from body if provided (array of strings), else keep existing
      if (typeof images !== 'undefined') {
        // ensure images is an array; if it's a comma-separated string, split it
        if (Array.isArray(images)) {
          product.images = images;
        } else if (typeof images === 'string') {
          // try to parse JSON or CSV
          try {
            const maybe = JSON.parse(images);
            if (Array.isArray(maybe)) product.images = maybe;
            else product.images = images.split(',').map((s) => s.trim()).filter(Boolean);
          } catch {
            product.images = images.split(',').map((s) => s.trim()).filter(Boolean);
          }
        }
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

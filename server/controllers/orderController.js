'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');

/**
 * Helper: safe ObjectId validation
 * Returns true if value is a valid mongo ObjectId.
 */
const isValidObjectId = (value) => {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));
};

/**
 * Helper: make image path absolute using current request host/protocol
 * - If `p` is already an absolute URL, return as-is
 * - Otherwise remove leading slashes and prefix with protocol + host
 */
const makeAbsolute = (req, p) => {
  if (!p) return p;
  const s = String(p).trim();
  if (!s) return p;
  if (s.startsWith('http') || s.startsWith('//')) return s;
  const trimmed = s.replace(/^\/+/, ''); // remove leading slash(es)
  return `${req.protocol}://${req.get('host')}/${trimmed}`;
};

/**
 * Helper: attempt to extract a usable image string from many shapes.
 * Accepts a string, object, or nested value; returns absolute URL or null.
 */
const extractImageValue = (req, value) => {
  if (!value) return null;
  // string -> absolute
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    // ignore common placeholder tokens
    if (s.toLowerCase() === 'placeholder' || s === '<none>') return null;
    return makeAbsolute(req, s);
  }

  // array -> pick first usable
  if (Array.isArray(value)) {
    for (const v of value) {
      const got = extractImageValue(req, v);
      if (got) return got;
    }
    return null;
  }

  // object -> try keys commonly used
  if (typeof value === 'object') {
    // common keys that might contain urls
    const keys = [
      'url',
      'path',
      'src',
      'location',
      'publicUrl',
      'image',
      'thumbnail',
      'file',
      'filename',
      'default',
    ];
    for (const k of keys) {
      if (value[k] && typeof value[k] === 'string') {
        const out = String(value[k]).trim();
        if (out && out.toLowerCase() !== 'placeholder' && out !== '<none>') {
          return makeAbsolute(req, out);
        }
      }
      // sometimes nested arrays/objects
      if (value[k] && (typeof value[k] === 'object' || Array.isArray(value[k]))) {
        const nested = extractImageValue(req, value[k]);
        if (nested) return nested;
      }
    }

    // fallback: examine all string-ish values on object
    for (const v of Object.values(value)) {
      if (typeof v === 'string' && v.trim()) {
        const out = v.trim();
        if (out.toLowerCase() !== 'placeholder' && out !== '<none>') {
          return makeAbsolute(req, out);
        }
      }
      if (typeof v === 'object' || Array.isArray(v)) {
        const nested = extractImageValue(req, v);
        if (nested) return nested;
      }
    }
  }

  return null;
};

/**
 * Map populated product image fields to absolute URLs (safe, defensive)
 * Accepts an order object (mongoose doc or plain object) and returns a cloned object
 * with:
 *  - product.images normalized to absolute URLs (if present)
 *  - product.image normalized
 *  - item-level `image` and `thumbnail` fields set when possible (so front-end can read it.image)
 */
const mapOrderImagesToAbsolute = (req, order) => {
  // convert mongoose doc to plain object if needed
  const obj =
    order && typeof order.toObject === 'function'
      ? order.toObject()
      : JSON.parse(JSON.stringify(order || {}));

  if (!Array.isArray(obj.products)) return obj;

  obj.products = obj.products.map((pi) => {
    // defensive: pi may be { product: Object } or { product: id }
    try {
      if (pi && pi.product && typeof pi.product === 'object') {
        const product = { ...pi.product };

        // Normalize images array from several possible key names
        const possibleArrays = [
          product.images,
          product.photos,
          product.gallery,
          product.pictures,
          product.imgs,
        ];

        // Build normalized images array (strings)
        let normalizedImages = [];
        // try the explicit `images` first (if array)
        if (Array.isArray(product.images) && product.images.length) {
          normalizedImages = product.images
            .map((x) => extractImageValue(req, x))
            .filter(Boolean);
        } else {
          // search other possible array fields
          for (const candidate of possibleArrays) {
            if (Array.isArray(candidate) && candidate.length) {
              normalizedImages = candidate
                .map((x) => extractImageValue(req, x))
                .filter(Boolean);
              if (normalizedImages.length) break;
            }
          }
        }

        // if product.images was a single string, normalize it
        if ((!normalizedImages || normalizedImages.length === 0) && product.images && typeof product.images === 'string') {
          const one = extractImageValue(req, product.images);
          if (one) normalizedImages = [one];
        }

        // ensure we also check product.image / product.photo / product.thumbnail
        if ((!normalizedImages || normalizedImages.length === 0)) {
          const fallbackCandidates = [
            product.image,
            product.photo,
            product.thumbnail,
            (product._doc && product._doc.image) || null,
            (product._doc && product._doc.images && product._doc.images[0]) || null,
          ];
          for (const c of fallbackCandidates) {
            const v = extractImageValue(req, c);
            if (v) {
              normalizedImages.push(v);
              break;
            }
          }
        }

        // attach normalized images back to product (if any)
        if (normalizedImages.length) {
          product.images = normalizedImages;
          // set primary image if not already set
          if (!product.image) product.image = normalizedImages[0];
        } else {
          // ensure product.images is at least an empty array (so frontend can inspect)
          product.images = product.images && Array.isArray(product.images) ? product.images.map((x) => extractImageValue(req, x)).filter(Boolean) : [];
        }

        // compute first usable image for this item
        const firstImg = extractImageValue(req, product.images && product.images[0]) || extractImageValue(req, product.image) || extractImageValue(req, product.photo) || extractImageValue(req, product.thumbnail);

        // set item-level fields so frontend finds it.image easily
        const piCopy = { ...pi, product };
        if (firstImg) {
          piCopy.image = firstImg;
          // also set thumbnail (small clients may look for thumbnail)
          piCopy.thumbnail = firstImg;
        } else {
          // if nothing found, leave as-is (frontend will fallback to placeholder)
        }

        return piCopy;
      }
    } catch (e) {
      // ignore mapping errors and return original
      console.error('mapOrderImagesToAbsolute mapping error:', e && e.message);
    }
    return pi;
  });

  return obj;
};

/**
 * @desc Create new order
 * @route POST /api/orders
 * @access Private
 */
const createOrder = async (req, res) => {
  try {
    console.log('createOrder req.body:', JSON.stringify(req.body, null, 2));

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // accept multiple possible keys clients might send
    const incoming = req.body.products || req.body.orderItems || req.body.items || [];

    // normalize to schema shape: { product, quantity }
    const products = Array.isArray(incoming)
      ? incoming
          .map((it) => {
            const pid = (it && (it.product || it.productId || it._id || it.id)) || null;
            const qty = Math.max(1, Number(it?.quantity ?? it?.qty ?? it?.count ?? 1) || 1);
            return pid ? { product: String(pid), quantity: qty } : null;
          })
          .filter(Boolean)
      : [];

    if (!products.length) {
      return res.status(400).json({
        message: 'No products in order',
        received: Array.isArray(incoming) ? incoming.slice(0, 5) : incoming,
      });
    }

    // Optional: validate product ids look like ObjectIds. If you use string IDs intentionally, remove this.
    const invalidProduct = products.find((p) => !isValidObjectId(p.product));
    if (invalidProduct) {
      return res.status(400).json({ message: 'Invalid product id in items', item: invalidProduct });
    }

    const shippingAddress = req.body.shippingAddress || req.body.shipping || {};
    if (
      !shippingAddress ||
      !shippingAddress.address ||
      !shippingAddress.city ||
      !shippingAddress.postalCode ||
      !shippingAddress.country
    ) {
      return res.status(400).json({
        message: 'Missing shippingAddress (address/city/postalCode/country) required',
        shippingAddress,
      });
    }

    const paymentMethod = req.body.paymentMethod || req.body.payment_method;
    if (!paymentMethod) {
      return res.status(400).json({ message: 'Missing paymentMethod' });
    }

    const totalRaw = req.body.total ?? req.body.totalPrice ?? req.body.subtotal ?? req.body.itemsPrice;
    const total = Number(totalRaw);
    if (!Number.isFinite(total) || total < 0) {
      return res.status(400).json({ message: 'Invalid or missing total' });
    }

    const order = new Order({
      user: req.user._id,
      products,
      shippingAddress: {
        address: shippingAddress.address,
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country,
      },
      paymentMethod,
      itemsPrice: req.body.itemsPrice,
      taxPrice: req.body.taxPrice,
      shippingPrice: req.body.shippingPrice,
      total,
    });

    const createdOrder = await order.save();
    return res.status(201).json(createdOrder);
  } catch (error) {
    console.error('createOrder error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

/**
 * @desc Get logged-in user's orders
 * @route GET /api/orders/myorders
 * @access Private
 */
const getMyOrders = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // include product basic details & images
    const orders = await Order.find({ user: req.user._id }).populate('products.product', 'name price images image');

    // convert product image paths to absolute URLs and attach item-level image fields
    const sanitized = orders.map((ord) => mapOrderImagesToAbsolute(req, ord));

    return res.json(sanitized);
  } catch (error) {
    console.error('getMyOrders error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

/**
 * @desc Get order by id
 * @route GET /api/orders/:id
 * @access Private (owner or admin)
 */
const getOrderById = async (req, res) => {
  try {
    const id = req.params.id;
    console.log('getOrderById request for id:', id);

    if (!id) {
      return res.status(400).json({ message: 'Order id is required' });
    }

    // Common source of bugs: clients sending 'my' to this route.
    if (String(id).toLowerCase() === 'my') {
      return res
        .status(400)
        .json({ message: "Use GET /api/orders/myorders for the current user's orders (don't use ':id' = 'my')" });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    // IMPORTANT: include images in the populate so frontend receives product.images
    const order = await Order.findById(id)
      .populate('user', 'name email')
      .populate('products.product', 'name price images image');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // only owner or admin allowed
    const orderUserId = String(order.user?._id ?? order.user);
    const requestingUserId = req.user?._id ? String(req.user._id) : null;
    if (requestingUserId && orderUserId !== requestingUserId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    // map images
    const sanitized = mapOrderImagesToAbsolute(req, order);

    return res.json(sanitized);
  } catch (error) {
    console.error('getOrderById error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

/**
 * @desc Get all orders (admin)
 * @route GET /api/orders
 * @access Admin
 */
const getOrders = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Admin-only behavior should be enforced in route middleware; still check here
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const orders = await Order.find({}).populate('user', 'name email').populate('products.product', 'name price images image');

    // convert product image paths to absolute URLs
    const sanitized = orders.map((ord) => mapOrderImagesToAbsolute(req, ord));

    return res.json(sanitized);
  } catch (error) {
    console.error('getOrders error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

/**
 * @desc Update order status
 * @route PUT /api/orders/:id
 * @access Admin
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Order id is required' });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Admin check (should be enforced in route), but safe-guard here
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    if (req.body.isPaid === true || req.body.paymentStatus === 'paid' || req.body.paymentStatus === true) {
      if (!order.isPaid) {
        order.isPaid = true;
        order.paidAt = new Date();
      }
      if (req.body.paymentResult) {
        order.paymentResult = {
          id: req.body.paymentResult.id,
          status: req.body.paymentResult.status,
          update_time: req.body.paymentResult.update_time,
          email_address: req.body.paymentResult.email_address,
        };
      }
    }

    if (req.body.isDelivered === true || req.body.deliveryStatus === 'delivered' || req.body.deliveryStatus === true) {
      if (!order.isDelivered) {
        order.isDelivered = true;
        order.deliveredAt = new Date();
      }
    }

    if (typeof req.body.total !== 'undefined') {
      const newTotal = Number(req.body.total);
      if (Number.isFinite(newTotal)) order.total = newTotal;
    }

    const updatedOrder = await order.save();
    return res.json(updatedOrder);
  } catch (error) {
    console.error('updateOrderStatus error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
};

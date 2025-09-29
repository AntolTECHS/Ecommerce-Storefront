const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { protect, admin } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Order = require("../models/Order");
const Message = require("../models/Message");
const Login = require("../models/Login");
const Product = require("../models/Product");

const router = express.Router();

/* ============== CONFIG ============== */
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_FILES = 10; // adjust as needed
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB per file

/* ============== MULTER STORAGE ============== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const safeOriginal = (file.originalname || "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "");
    const rand = Math.floor(Math.random() * 1e9);
    cb(null, `${Date.now()}-${rand}-${safeOriginal}`);
  },
});

/* ============== FILE FILTER ============== */
function checkFileType(file) {
  // Allowed extensions
  const allowedExt = /jpg|jpeg|png|gif|webp|bmp|jfif|heic|svg/;
  const extOk = allowedExt.test(
    path.extname((file.originalname || "").toLowerCase())
  );
  const mimeOk = !!(file.mimetype && file.mimetype.startsWith("image/"));
  return extOk || mimeOk;
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    try {
      const ok = checkFileType(file);
      if (ok) return cb(null, true);

      console.warn("❌ Rejected file:", {
        name: file.originalname,
        type: file.mimetype,
      });

      const err = new Error(
        "Only image files are allowed (jpg, jpeg, png, gif, webp, bmp, jfif, heic, svg)."
      );
      err.code = "INVALID_FILE_TYPE";
      return cb(err);
    } catch (e) {
      return cb(e);
    }
  },
});

/* ============== UPLOAD HANDLER (wrap multer to catch errors) ============== */
const uploadHandler = (req, res, next) => {
  upload.array("images", MAX_FILES)(req, res, (err) => {
    if (err) {
      console.error("Multer upload error:", err);
      if (err instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ message: err.message || "File upload failed", code: err.code });
      }
      return res
        .status(400)
        .json({ message: err.message || "File upload failed" });
    }
    next();
  });
};

/* ============== HELPERS ============== */
const toUploadPath = (filenameOrPath) => {
  if (!filenameOrPath) return null;
  if (filenameOrPath.startsWith("/uploads/"))
    return path.join(uploadsDir, path.basename(filenameOrPath));
  if (filenameOrPath.startsWith("uploads/"))
    return path.join(uploadsDir, path.basename(filenameOrPath));
  return path.join(uploadsDir, path.basename(filenameOrPath));
};

const safeUnlink = async (filePath) => {
  try {
    if (!filePath) return;
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadsDir))) {
      console.warn(
        "[safeUnlink] refusing to delete outside uploadsDir:",
        resolved
      );
      return;
    }
    await fs.promises.unlink(resolved).catch(() => {});
  } catch (err) {
    console.error("safeUnlink error:", err);
  }
};

/* ============== ROUTER DEBUG LOGGER (temporary, helpful during dev) ============== */
router.use((req, res, next) => {
  // Remove or lower log verbosity in production
  try {
    console.log("[ADMIN ROUTER]", req.method, req.path);
  } catch (e) {}
  next();
});

/* ============== USER ROUTES ============== */
// GET users
router.get("/users", protect, admin, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// GET single user
router.get("/users/:id", protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// DELETE user (minimal)
router.delete("/users/:id", protect, admin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // attempt to clean up related collections; ignore errors but log them
    try {
      await Order.deleteMany({ user: userId });
    } catch (e) {
      console.warn("Could not delete orders for user", userId, e.message || e);
    }
    try {
      await Login.deleteMany({ user: userId });
    } catch (e) {
      console.warn("Could not delete logins for user", userId, e.message || e);
    }
    try {
      // depending on your Message schema, messages might reference user by id or email
      // try both strategies
      await Message.deleteMany({ user: userId }).catch(() => {});
      if (user.email) await Message.deleteMany({ email: user.email }).catch(() => {});
    } catch (e) {
      console.warn("Could not delete messages for user", userId, e.message || e);
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: "User and related data deleted" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* ============== ORDER ROUTES ============== */
// GET orders (admin)
router.get("/orders", protect, admin, async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// DELETE order (admin)
router.delete("/orders/:id", protect, admin, async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    await Order.findByIdAndDelete(orderId);

    // Optionally, emit socket event if io is attached to app (controllers elsewhere may do this)
    // const io = req.app.get('io'); if (io) io.emit('orderDeleted', { id: orderId });

    res.json({ message: "Order deleted" });
  } catch (err) {
    console.error("❌ Error deleting order:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

// UPDATE order (admin) - supports marking paid / delivered or other partial updates
router.put("/orders/:id", protect, admin, async (req, res) => {
  try {
    const orderId = req.params.id;
    const updates = req.body || {};

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Only allow specific admin-updatable fields for safety
    const allowed = ["isPaid", "paidAt", "isDelivered", "deliveredAt", "status"];
    for (const key of Object.keys(updates)) {
      if (allowed.includes(key)) {
        order[key] = updates[key];
      }
    }

    const saved = await order.save();

    // const io = req.app.get('io'); if (io) io.emit('orderUpdated', saved);

    res.json(saved);
  } catch (err) {
    console.error("❌ Error updating order:", err);
    res.status(500).json({ message: "Failed to update order" });
  }
});

/* ============== MESSAGE ROUTES ============== */
// GET messages
router.get("/messages", protect, admin, async (req, res) => {
  try {
    const messages = await Message.find();
    res.json(messages);
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

/* ============== LOGIN ROUTES ============== */
// GET logins
router.get("/logins", protect, admin, async (req, res) => {
  try {
    const logins = await Login.find().populate("user", "name email role");
    res.json(logins);
  } catch (err) {
    console.error("❌ Error fetching logins:", err);
    res.status(500).json({ message: "Failed to fetch logins" });
  }
});

/* ============== PRODUCT ROUTES ============== */
// GET products
router.get("/products", protect, admin, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

/* ============== CREATE product (with images) ============== */
router.post("/products", protect, admin, uploadHandler, async (req, res) => {
  try {
    console.log("POST /api/admin/products - body:", req.body);
    console.log(
      "POST /api/admin/products - files count:",
      req.files?.length || 0
    );

    const { name, price, category, stock, description } = req.body;
    if (!name || !price || !category || !stock) {
      return res
        .status(400)
        .json({ message: "Name, price, category, and stock are required" });
    }

    const numericPrice = Number(price);
    const numericStock = Number(stock);
    if (isNaN(numericPrice) || isNaN(numericStock)) {
      return res
        .status(400)
        .json({ message: "Price and stock must be valid numbers" });
    }

    const images = (req.files || []).map((f) => `/uploads/${f.filename}`);

    const product = await Product.create({
      name,
      price: numericPrice,
      category,
      stock: numericStock,
      description: description || "",
      images,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("❌ Error creating product:", err);
    res
      .status(500)
      .json({ message: err.message || "Failed to create product" });
  }
});

/* ============== UPDATE product ============== */
router.put("/products/:id", protect, admin, uploadHandler, async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const { name, price, category, stock, description } = req.body;
    if (!name || !price || !category || !stock) {
      return res
        .status(400)
        .json({ message: "Name, price, category, and stock are required" });
    }

    const numericPrice = Number(price);
    const numericStock = Number(stock);
    if (isNaN(numericPrice) || isNaN(numericStock)) {
      return res
        .status(400)
        .json({ message: "Price and stock must be valid numbers" });
    }

    let newImages = product.images || [];

    if (req.files && req.files.length > 0) {
      if (Array.isArray(product.images)) {
        for (const imgPath of product.images) {
          await safeUnlink(toUploadPath(imgPath));
        }
      }
      newImages = req.files.map((f) => `/uploads/${f.filename}`);
    }

    product.name = name;
    product.price = numericPrice;
    product.category = category;
    product.stock = numericStock;
    product.description = description || "";
    product.images = newImages;

    const updated = await product.save();
    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res
      .status(500)
      .json({ message: err.message || "Failed to update product" });
  }
});

/* ============== DELETE product ============== */
router.delete("/products/:id", protect, admin, async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (Array.isArray(product.images)) {
      for (const imgPath of product.images) {
        await safeUnlink(toUploadPath(imgPath));
      }
    }

    await Product.findByIdAndDelete(productId);
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("❌ Error deleting product:", err);
    res.status(500).json({ message: "Failed to delete product" });
  }
});

/* ============== ANALYTICS ============== */
router.get("/analytics", protect, admin, async (req, res) => {
  try {
    const today = new Date();
    const last7Days = new Date(today);
    last7Days.setDate(today.getDate() - 6);

    const formatDate = (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const analyticsMap = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(last7Days);
      d.setDate(last7Days.getDate() + i);
      analyticsMap[formatDate(d)] = {
        date: formatDate(d),
        orders: 0,
        revenue: 0,
        logins: 0,
      };
    }

    const orders = await Order.find({ createdAt: { $gte: last7Days } });
    orders.forEach((order) => {
      const dateKey = formatDate(order.createdAt);
      if (analyticsMap[dateKey]) {
        analyticsMap[dateKey].orders += 1;
        analyticsMap[dateKey].revenue += order.totalPrice || 0;
      }
    });

    const logins = await Login.find({ createdAt: { $gte: last7Days } });
    logins.forEach((login) => {
      const dateKey = formatDate(login.createdAt);
      if (analyticsMap[dateKey]) analyticsMap[dateKey].logins += 1;
    });

    res.json(Object.values(analyticsMap));
  } catch (err) {
    console.error("❌ Error fetching analytics:", err);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});

module.exports = router;

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

const MAX_FILES = 10;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

/* ============== MULTER ============== */
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

function checkFileType(file) {
  const allowedExt = /jpg|jpeg|png|gif|webp|bmp|jfif|heic|svg/;
  const extOk = allowedExt.test(path.extname((file.originalname || "").toLowerCase()));
  const mimeOk = !!(file.mimetype && file.mimetype.startsWith("image/"));
  return extOk || mimeOk;
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    try {
      if (checkFileType(file)) return cb(null, true);
      const err = new Error("Only image files are allowed");
      err.code = "INVALID_FILE_TYPE";
      cb(err);
    } catch (e) {
      cb(e);
    }
  },
});

const uploadHandler = (req, res, next) => {
  upload.array("images", MAX_FILES)(req, res, (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ message: err.message || "File upload failed" });
    }
    next();
  });
};

/* ============== HELPERS ============== */
const toUploadPath = (filenameOrPath) => {
  if (!filenameOrPath || typeof filenameOrPath !== "string") return null;
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
    if (!resolved.startsWith(path.resolve(uploadsDir))) return;
    await fs.promises.unlink(resolved).catch(() => {});
  } catch (err) {
    console.error("safeUnlink error:", err);
  }
};

/* ============== DEBUG LOGGER ============== */
router.use((req, res, next) => {
  console.log("[ADMIN ROUTER]", req.method, req.path);
  next();
});

/* ============== USER ROUTES ============== */
router.get("/users", protect, admin, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get("/users/:id", protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

router.delete("/users/:id", protect, admin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await Order.deleteMany({ user: userId }).catch(() => {});
    await Login.deleteMany({ user: userId }).catch(() => {});
    await Message.deleteMany({ user: userId }).catch(() => {});
    if (user.email) await Message.deleteMany({ email: user.email }).catch(() => {});

    await User.findByIdAndDelete(userId);

    res.json({ message: "User and related data deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* ============== ORDER ROUTES ============== */
router.get("/orders", protect, admin, async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.delete("/orders/:id", protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete order" });
  }
});

router.put("/orders/:id", protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const allowed = ["isPaid", "paidAt", "isDelivered", "deliveredAt", "status"];
    Object.keys(req.body).forEach((key) => {
      if (allowed.includes(key)) order[key] = req.body[key];
    });

    const saved = await order.save();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: "Failed to update order" });
  }
});

/* ============== MESSAGE ROUTES ============== */
router.get("/messages", protect, admin, async (req, res) => {
  try {
    const messages = await Message.find();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

/* ============== LOGIN ROUTES ============== */
router.get("/logins", protect, admin, async (req, res) => {
  try {
    const logins = await Login.find().populate("user", "name email role");
    res.json(logins);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch logins" });
  }
});

/* ============== PRODUCT ROUTES ============== */
router.get("/products", protect, admin, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

router.post("/products", protect, admin, uploadHandler, async (req, res) => {
  try {
    const { name, price, category, stock, description } = req.body;
    if (!name || !price || !category || !stock) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const product = await Product.create({
      name,
      price: Number(price),
      category,
      stock: Number(stock),
      description: description || "",
      images: (req.files || []).map((f) => `/uploads/${f.filename}`),
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to create product" });
  }
});

router.put("/products/:id", protect, admin, uploadHandler, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const { name, price, category, stock, description } = req.body;

    if (req.files && req.files.length > 0) {
      if (Array.isArray(product.images)) {
        for (const imgPath of product.images) {
          const p = toUploadPath(imgPath);
          if (p) await safeUnlink(p);
        }
      }
      product.images = req.files.map((f) => `/uploads/${f.filename}`);
    }

    if (name) product.name = name;
    if (price) product.price = Number(price);
    if (category) product.category = category;
    if (stock) product.stock = Number(stock);
    if (description) product.description = description;

    const updated = await product.save();
    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({ message: "Failed to update product" });
  }
});

router.delete("/products/:id", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (Array.isArray(product.images)) {
      for (const imgPath of product.images) {
        const p = toUploadPath(imgPath);
        if (p) await safeUnlink(p);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (err) {
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
      analyticsMap[formatDate(d)] = { date: formatDate(d), orders: 0, revenue: 0, logins: 0 };
    }

    const orders = await Order.find({ createdAt: { $gte: last7Days } });
    orders.forEach((order) => {
      const dateKey = formatDate(order.createdAt);
      if (analyticsMap[dateKey]) {
        analyticsMap[dateKey].orders++;
        analyticsMap[dateKey].revenue += order.totalPrice || 0;
      }
    });

    const logins = await Login.find({ createdAt: { $gte: last7Days } });
    logins.forEach((login) => {
      const dateKey = formatDate(login.createdAt);
      if (analyticsMap[dateKey]) analyticsMap[dateKey].logins++;
    });

    res.json(Object.values(analyticsMap));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});

module.exports = router;

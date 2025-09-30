const express = require("express");
const { protect, admin } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Order = require("../models/Order");
const Message = require("../models/Message");
const Login = require("../models/Login");
const Product = require("../models/Product");

// ✅ Cloudinary + Multer
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage engine for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "techstore", // Cloudinary folder
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({ storage });

const router = express.Router();

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
    await Order.deleteMany({ user: userId });
    await Login.deleteMany({ user: userId });
    await Message.deleteMany({ user: userId });
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
  } catch {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.put("/orders/:id", protect, admin, async (req, res) => {
  try {
    const updates = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch {
    res.status(500).json({ message: "Failed to update order" });
  }
});

router.delete("/orders/:id", protect, admin, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Order deleted" });
  } catch {
    res.status(500).json({ message: "Failed to delete order" });
  }
});

/* ============== MESSAGE ROUTES ============== */
router.get("/messages", protect, admin, async (req, res) => {
  try {
    const messages = await Message.find();
    res.json(messages);
  } catch {
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

/* ============== LOGIN ROUTES ============== */
router.get("/logins", protect, admin, async (req, res) => {
  try {
    const logins = await Login.find().populate("user", "name email role");
    res.json(logins);
  } catch {
    res.status(500).json({ message: "Failed to fetch logins" });
  }
});

/* ============== PRODUCT ROUTES ============== */
router.get("/products", protect, admin, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// CREATE product with Cloudinary images
router.post("/products", protect, admin, upload.array("images", 10), async (req, res) => {
  try {
    const { name, price, category, stock, description } = req.body;
    if (!name || !price || !category || !stock) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const images = (req.files || []).map((f) => ({
      url: f.path, // Cloudinary secure_url
      public_id: f.filename, // Cloudinary public ID
    }));

    const product = await Product.create({
      name,
      price,
      category,
      stock,
      description,
      images,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("❌ Error creating product:", err);
    res.status(500).json({ message: "Failed to create product" });
  }
});

// UPDATE product with Cloudinary images
router.put("/products/:id", protect, admin, upload.array("images", 10), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const { name, price, category, stock, description } = req.body;

    // If new images uploaded, replace
    if (req.files && req.files.length > 0) {
      product.images = req.files.map((f) => ({
        url: f.path,
        public_id: f.filename,
      }));
    }

    product.name = name;
    product.price = price;
    product.category = category;
    product.stock = stock;
    product.description = description || "";

    const updated = await product.save();
    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({ message: "Failed to update product" });
  }
});

// DELETE product + Cloudinary images
router.delete("/products/:id", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // remove from Cloudinary
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (img.public_id) {
          await cloudinary.uploader.destroy(img.public_id);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);
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
      analyticsMap[formatDate(d)] = { date: formatDate(d), orders: 0, revenue: 0, logins: 0 };
    }

    const orders = await Order.find({ createdAt: { $gte: last7Days } });
    orders.forEach((order) => {
      const key = formatDate(order.createdAt);
      if (analyticsMap[key]) {
        analyticsMap[key].orders += 1;
        analyticsMap[key].revenue += order.totalPrice || 0;
      }
    });

    const logins = await Login.find({ createdAt: { $gte: last7Days } });
    logins.forEach((login) => {
      const key = formatDate(login.createdAt);
      if (analyticsMap[key]) analyticsMap[key].logins += 1;
    });

    res.json(Object.values(analyticsMap));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});

module.exports = router;

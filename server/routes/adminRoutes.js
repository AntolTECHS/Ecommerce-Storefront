const express = require("express");
const { protect, admin } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Order = require("../models/Order");
const Message = require("../models/Message");
const Login = require("../models/Login");
const Product = require("../models/Product");
const { cloudinary, upload } = require("../config/cloudinary");

const router = express.Router();

/* ============== LOGGER ============== */
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
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

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

router.delete("/users/:id", protect, admin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await Promise.all([
      Order.deleteMany({ user: userId }),
      Login.deleteMany({ user: userId }),
      Message.deleteMany({ user: userId }),
    ]);

    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: "User and related data deleted" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* ============== ORDER ROUTES ============== */
router.get("/orders", protect, admin, async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.delete("/orders/:id", protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    await order.deleteOne();
    res.json({ message: "Order deleted" });
  } catch (err) {
    console.error("❌ Error deleting order:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

router.put("/orders/:id", protect, admin, async (req, res) => {
  try {
    const updates = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    ["isPaid", "paidAt", "isDelivered", "deliveredAt", "status"].forEach((key) => {
      if (updates[key] !== undefined) order[key] = updates[key];
    });

    const saved = await order.save();
    res.json(saved);
  } catch (err) {
    console.error("❌ Error updating order:", err);
    res.status(500).json({ message: "Failed to update order" });
  }
});

/* ============== PRODUCT ROUTES ============== */
router.get("/products", protect, admin, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

router.post("/products", protect, admin, upload.array("images", 10), async (req, res) => {
  try {
    const { name, price, category, stock, description } = req.body;
    if (!name || !price || !category || !stock) {
      return res.status(400).json({ message: "Name, price, category, and stock are required" });
    }

    const images = (req.files || []).map((f) => f.path);

    const product = await Product.create({
      name,
      price: Number(price),
      category,
      stock: Number(stock),
      description: description || "",
      images,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("❌ Error creating product:", err);
    res.status(500).json({ message: err.message || "Failed to create product" });
  }
});

router.put("/products/:id", protect, admin, upload.array("images", 10), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const { name, price, category, stock, description } = req.body;

    // delete old images from Cloudinary if new ones are uploaded
    if (req.files && req.files.length > 0 && Array.isArray(product.images)) {
      for (const url of product.images) {
        const publicId = url.split("/").pop().split(".")[0]; // crude publicId extraction
        await cloudinary.uploader.destroy(`techstore/${publicId}`);
      }
      product.images = req.files.map((f) => f.path);
    }

    product.name = name;
    product.price = Number(price);
    product.category = category;
    product.stock = Number(stock);
    product.description = description || "";

    const updated = await product.save();
    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({ message: err.message || "Failed to update product" });
  }
});

router.delete("/products/:id", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (Array.isArray(product.images)) {
      for (const url of product.images) {
        const publicId = url.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`techstore/${publicId}`);
      }
    }

    await product.deleteOne();
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
        analyticsMap[key].orders++;
        analyticsMap[key].revenue += order.totalPrice || 0;
      }
    });

    const logins = await Login.find({ createdAt: { $gte: last7Days } });
    logins.forEach((login) => {
      const key = formatDate(login.createdAt);
      if (analyticsMap[key]) analyticsMap[key].logins++;
    });

    res.json(Object.values(analyticsMap));
  } catch (err) {
    console.error("❌ Error fetching analytics:", err);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});

module.exports = router;

const express = require("express");
const { 
  createOrder, 
  getMyOrders, 
  getOrders, 
  updateOrderStatus 
} = require("../controllers/orderController");
const { protect, admin } = require("../middleware/authMiddleware");

const router = express.Router();

// User routes
router.post("/", protect, createOrder);
router.get("/myorders", protect, getMyOrders);

// Admin routes
router.get("/", protect, admin, getOrders);
router.put("/:id", protect, admin, updateOrderStatus);

module.exports = router;

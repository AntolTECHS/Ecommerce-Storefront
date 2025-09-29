// routes/orderRoutes.js
const express = require("express");
const {
  createOrder,
  getMyOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const { protect, admin } = require("../middleware/authMiddleware");
const validateObjectId = require("../middleware/validateobjectId"); // add this

const router = express.Router();

// User routes
router.post("/", protect, createOrder);
router.get("/myorders", protect, getMyOrders);
router.get("/:id", protect, validateObjectId("id"), getOrderById); // validate id

// Admin routes
router.get("/", protect, admin, getOrders);
router.put("/:id", protect, validateObjectId("id"), admin, updateOrderStatus); // validate id

module.exports = router;

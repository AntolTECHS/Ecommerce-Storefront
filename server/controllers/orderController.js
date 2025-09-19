const Order = require("../models/Order");

// @desc Create new order
// @route POST /api/orders
// @access Private
const createOrder = async (req, res) => {
  try {
    const { products, totalPrice } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({ message: "No products in order" });
    }

    const order = new Order({
      user: req.user._id,
      products,
      totalPrice,
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Get logged-in user's orders
// @route GET /api/orders/myorders
// @access Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).populate("products.product");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Get all orders
// @route GET /api/orders
// @access Admin
const getOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate("user", "name email")
      .populate("products.product");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Update order status
// @route PUT /api/orders/:id
// @access Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { paymentStatus, deliveryStatus } = req.body;
    const order = await Order.findById(req.params.id);

    if (order) {
      order.paymentStatus = paymentStatus || order.paymentStatus;
      order.deliveryStatus = deliveryStatus || order.deliveryStatus;

      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: "Order not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createOrder, getMyOrders, getOrders, updateOrderStatus };

// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User'); // ensure this path + case match your filename

// Protect middleware - require a valid Bearer token and attach user to req.user
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearer = authHeader && authHeader.startsWith('Bearer ');
  if (!bearer) {
    res.status(401);
    throw new Error('Not authorized, token missing');
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.status(401);
      throw new Error('Not authorized, user not found');
    }

    req.user = user; // attach user to request
    next();
  } catch (err) {
    console.error('auth protect error:', err.message || err);
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

// Admin middleware - must be used after protect (req.user must exist)
const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403);
  throw new Error('Not authorized as admin');
};

module.exports = { protect, admin };

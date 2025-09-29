// server/controllers/userController.js
const asyncHandler = require('express-async-handler');
const User = require('../models/User'); // ensure this path matches your model filename

// GET /api/users/me
const getUserProfile = asyncHandler(async (req, res) => {
  // protect middleware should have set req.user
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }
  const user = await User.findById(req.user._id).select('-password');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  res.json(user);
});

module.exports = { getUserProfile };

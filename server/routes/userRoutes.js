// server/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUserProfile } = require('../controllers/userController');

// GET /api/users/me
router.get('/me', protect, getUserProfile);

module.exports = router;

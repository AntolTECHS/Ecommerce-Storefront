// routes/contactRoutes.js
const express = require('express');
const { submitMessage, getMessages, deleteMessage } = require('../controllers/contactController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', submitMessage);                 // Public (anyone can send message)
router.get('/', protect, admin, getMessages);    // Admin only: list messages
router.delete('/:id', protect, admin, deleteMessage); // Admin only: delete a message

module.exports = router;

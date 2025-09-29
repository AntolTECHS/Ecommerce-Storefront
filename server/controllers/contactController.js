// controllers/contactController.js
'use strict';

const ContactMessage = require('../models/ContactMessage');

/**
 * Helper to check the model quickly and log useful debug info.
 * If ContactMessage is not a model this will return an error
 * response so the client doesn't get an opaque 500 with no logs.
 */
const ensureModel = (res) => {
  if (!ContactMessage || typeof ContactMessage.find !== 'function') {
    console.error('❌ ContactMessage model invalid or not exported correctly. Value:', ContactMessage);
    res.status(500).json({ message: 'Server misconfiguration: ContactMessage model is not available' });
    return false;
  }
  return true;
};

// POST /api/contact
const submitMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email and message are required.' });
    }

    if (!ensureModel(res)) return;

    const newMessage = await ContactMessage.create({
      name,
      email,
      subject,
      message,
    });

    // Emit real-time event if Socket.IO is available
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('messageCreated', newMessage);
      }
    } catch (emitErr) {
      console.warn('⚠️ Failed to emit messageCreated event', emitErr);
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage,
    });
  } catch (error) {
    console.error('submitMessage error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// GET /api/contact (Admin only)
const getMessages = async (req, res) => {
  try {
    if (!ensureModel(res)) return;

    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    return res.json(messages);
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// DELETE /api/contact/:id (Admin only) — useful to remove spam
const deleteMessage = async (req, res) => {
  try {
    if (!ensureModel(res)) return;

    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Message id required' });

    const msg = await ContactMessage.findById(id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    await ContactMessage.deleteOne({ _id: id });

    // Emit delete event
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('messageDeleted', { id });
      }
    } catch (emitErr) {
      console.warn('⚠️ Failed to emit messageDeleted event', emitErr);
    }

    return res.json({ success: true, message: 'Message deleted', id });
  } catch (error) {
    console.error('deleteMessage error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

module.exports = { submitMessage, getMessages, deleteMessage };

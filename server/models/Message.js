const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },  // sender’s name
    email: { type: String, required: true }, // sender’s email
    message: { type: String, required: true }, // the actual message
    isRead: { type: Boolean, default: false }, // admin can track read/unread
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);

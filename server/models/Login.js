// models/Login.js
const mongoose = require("mongoose");

const loginSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true } // ✅ createdAt will store login timestamp
);

module.exports = mongoose.model("Login", loginSchema);

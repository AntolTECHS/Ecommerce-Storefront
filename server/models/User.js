// server/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // normalize
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // Password reset fields
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for backward compatibility
userSchema.virtual("isAdmin").get(function () {
  return this.role === "admin";
});

// Hash password before saving (only if modified)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Generate a password reset token (raw token returned; hashed token stored)
userSchema.methods.generatePasswordResetToken = function () {
  // raw token to email to user
  const rawToken = crypto.randomBytes(32).toString("hex");

  // hashed token stored in DB
  const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

  this.resetPasswordToken = hashed;
  // token valid for 1 hour
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

  // Caller should save the model (e.g. user.save({ validateBeforeSave: false }))
  return rawToken;
};

// Optional: helper to clear reset token fields
userSchema.methods.clearPasswordReset = function () {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpire = undefined;
};

// Sanitize JSON output: hide sensitive fields
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpire;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);

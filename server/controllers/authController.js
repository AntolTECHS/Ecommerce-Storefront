// server/controllers/authController.js
const crypto = require("crypto");
const User = require("../models/User");
const Login = require("../models/Login");
const generateToken = require("../utils/generateToken");
const sendEmail = require("../utils/sendEmail");

// ✅ Strong password validator (reusable)
const validatePassword = (password) => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength) {
    return "Password must be at least 8 characters long.";
  }
  if (!hasUppercase) {
    return "Password must include at least one uppercase letter.";
  }
  if (!hasLowercase) {
    return "Password must include at least one lowercase letter.";
  }
  if (!hasNumber) {
    return "Password must include at least one number.";
  }
  if (!hasSpecial) {
    return "Password must include at least one special character.";
  }
  return null;
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ enforce strong password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const emailLower = email.toLowerCase();
    const userExists = await User.findOne({ email: emailLower });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({ name, email: emailLower, password });

    return res.status(201).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("registerUser error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const emailLower = email.toLowerCase();
    const user = await User.findOne({ email: emailLower });

    if (user && (await user.matchPassword(password))) {
      try {
        await Login.create({ user: user._id });
      } catch (e) {
        console.warn("Failed to record login event:", e);
      }

      return res.json({
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token: generateToken(user._id),
      });
    } else {
      return res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("loginUser error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const emailLower = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailLower });

    const genericResponse = {
      message: "If an account with that email exists, we've sent password reset instructions.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const frontendBase = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${frontendBase.replace(/\/$/, "")}/reset-password/${rawToken}`;

    const message = `
You requested a password reset. Click below to reset your password (valid 1 hour):

${resetUrl}

If you did not request this, ignore this email.
`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Password reset instructions",
        text: message,
        html: `<pre style="white-space:pre-wrap">${message}</pre>`,
      });

      return res.status(200).json(genericResponse);
    } catch (emailErr) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("forgotPassword sendEmail error:", emailErr);
      return res.status(500).json({ message: "Failed to send reset email" });
    }
  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const { password } = req.body;

    if (!rawToken) {
      return res.status(400).json({ message: "Invalid or missing token" });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    // ✅ enforce strong password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Token is invalid or has expired" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
};

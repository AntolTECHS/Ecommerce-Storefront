// server/controllers/authController.js
'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const Login = require('../models/Login');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');

// Strong password validator (kept)
const validatePassword = (password) => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!password || password.length < minLength) {
    return 'Password must be at least 8 characters long.';
  }
  if (!hasUppercase) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!hasLowercase) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!hasNumber) {
    return 'Password must include at least one number.';
  }
  if (!hasSpecial) {
    return 'Password must include at least one special character.';
  }
  return null;
};

// Register (unchanged)
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const emailLower = email.toLowerCase();
    const userExists = await User.findOne({ email: emailLower });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const user = await User.create({ name, email: emailLower, password });

    return res.status(201).json({
      success: true,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('registerUser error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Login (unchanged)
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const emailLower = email.toLowerCase();
    const user = await User.findOne({ email: emailLower });

    if (user && (await user.matchPassword(password))) {
      try {
        await Login.create({ user: user._id });
      } catch (e) {
        console.warn('Failed to record login event:', e);
      }

      return res.json({
        success: true,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role },
        token: generateToken(user._id),
      });
    } else {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('loginUser error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const emailLower = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: emailLower });

    const genericResponse = {
      message: "If an account with that email exists, we've sent password reset instructions.",
    };

    if (!user) {
      // Always respond 200 to avoid account enumeration
      console.info('[forgotPassword] no user for', emailLower);
      return res.status(200).json(genericResponse);
    }

    // generate and store hashed token (user method)
    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Build reset URL (include both token and id for robustness)
    const frontendBase = (process.env.CLIENT_URL || process.env.FRONTEND_URL || process.env.RESET_URL_BASE || 'http://localhost:5173').replace(/\/$/, '');
    // Use query params so frontend can read both token and id easily
    const resetUrl = `${frontendBase}/reset-password?token=${rawToken}&id=${user._id}`;

    const message = `You requested a password reset. Click the link below to reset your password (valid 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password reset instructions',
        text: message,
        html: `<pre style="white-space:pre-wrap">${message}</pre>`,
      });

      console.info('[forgotPassword] reset email queued for', user.email);
      return res.status(200).json(genericResponse);
    } catch (emailErr) {
      // cleanup token fields to avoid stale tokens
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false }).catch(() => {});

      // log provider original error (if available)
      console.error('forgotPassword sendEmail error:', emailErr && emailErr.message ? emailErr.message : emailErr);
      if (emailErr && emailErr.original) console.error('Provider error:', emailErr.original);

      return res.status(500).json({ message: 'Failed to send reset email' });
    }
  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Reset password (POST /api/auth/reset-password/:token OR accept token+id in body/query)
const resetPassword = async (req, res) => {
  try {
    // accept token/id from either params, query or body
    const rawToken = req.params.token || req.query.token || req.body.token;
    const id = req.query.id || req.body.id; // optional
    const { password } = req.body;

    if (!rawToken) return res.status(400).json({ message: 'Invalid or missing token' });
    if (!password) return res.status(400).json({ message: 'Password is required' });

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const hashedToken = crypto.createHash('sha256').update(String(rawToken)).digest('hex');

    // Find user by hashed token (and optionally id if provided)
    const query = { resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } };
    if (id) query._id = id;

    const user = await User.findOne(query);

    if (!user) return res.status(400).json({ message: 'Token is invalid or has expired' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    // optional: notify user of change
    try {
      await sendEmail({
        to: user.email,
        subject: 'Your password was changed',
        text: 'Your password has been changed. If you did not perform this action, contact support immediately.',
        html: '<p>Your password has been changed. If you did not perform this action, contact support immediately.</p>',
      });
    } catch (notifyErr) {
      console.warn('resetPassword notification failed:', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
      if (notifyErr && notifyErr.original) console.warn('Provider error:', notifyErr.original);
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in.',
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
};

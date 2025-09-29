// server/routes/authRoutes.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");

const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const router = express.Router();

/**
 * Basic rate-limiter for auth endpoints to mitigate abuse.
 * - Faster limit for forgot-password to avoid email spam.
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 6, // limit each IP to 6 forgot-password requests per hour
  message: { message: "Too many password reset requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * small middleware to run express-validator and return first error nicely
 */
const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ message: first.msg, param: first.param });
  }
  next();
};

/* ========== ROUTES ========== */

// Public: register & login
router.post(
  "/register",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isString().withMessage("Password is required"),
  ],
  runValidation,
  registerUser
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  runValidation,
  loginUser
);

// Password reset: request reset (rate-limited)
router.post(
  "/forgot-password",
  forgotLimiter,
  [body("email").isEmail().withMessage("Valid email is required")],
  runValidation,
  forgotPassword
);

// Reset password: POST with token in path (also accepts token via query/body in controller)
// Validate that new password exists on body
router.post(
  "/reset-password/:token",
  authLimiter,
  [
    param("token").notEmpty().withMessage("Token is required"),
    body("password").isString().withMessage("Password is required"),
  ],
  runValidation,
  resetPassword
);

module.exports = router;

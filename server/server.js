/* ================== SERVER.JS (hardened) ================== */
const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

// Load environment variables
dotenv.config();

// Validate required ENV variables
if (!process.env.MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Important when deploying behind proxies (Render, Heroku, etc.)
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Middlewares: parsing, security, compression
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(compression());

// Rate limiter for API endpoints (adjust windows/limits as needed)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

/* ================== CORS ================== */
// By default use FRONTEND_URL from env; in development also allow localhost
const FRONTEND_URL = process.env.FRONTEND_URL || "https://techstore-tau.vercel.app";
const allowedOrigins = [FRONTEND_URL];
if (process.env.NODE_ENV === "development") {
  // add common local dev origins
  allowedOrigins.push("http://localhost:5173", "http://localhost:3000");
}

const corsOptions = {
  origin: function (origin, callback) {
    // allow non-browser requests like curl / server-to-server where origin is undefined
    if (!origin) return callback(null, true);

    // in development we log origin to help debugging; avoid verbose logs in production
    if (process.env.NODE_ENV === "development") {
      console.log("🔍 CORS origin:", origin);
    }

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply global CORS and preflight for /api/*
app.use(cors(corsOptions));
app.options(/^\/api\/.*$/, cors(corsOptions));

/* ================== LOGGER ================== */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* ================== ROUTES ================== */
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const contactRoutes = require("./routes/contactRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/contact", contactRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

/* ================== SOCKET.IO SETUP ================== */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      // allow server-to-server if origin is undefined
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  if (process.env.NODE_ENV === "development") {
    console.log("🟢 New client connected:", socket.id);
  }
  socket.on("disconnect", () => {
    if (process.env.NODE_ENV === "development") {
      console.log("🔴 Client disconnected:", socket.id);
    }
  });
});

/* ================== START SERVER ================== */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* ================== PROCESS SAFETY HANDLERS ================== */
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION! Reason:", reason);
  // give the server a moment to finish logs then exit
  setTimeout(() => process.exit(1), 1000);
});

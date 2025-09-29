/* ================== SERVER.JS (updated) ================== */
const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
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

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================== CORS / ALLOWED ORIGINS ================== */
/*
  Notes:
  - When using credentials (cookies, Authorization via browser), ACAO must be the explicit origin.
  - We allow requests with no Origin (server-to-server / curl) by returning true for falsy origin.
  - This configuration is applied globally and also explicitly to OPTIONS preflight.
*/
const allowedOrigins = [
  "http://localhost:5173", // local dev
  process.env.FRONTEND_URL || "https://techstore-tau.vercel.app", // production (override with FRONTEND_URL)
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true, // Access-Control-Allow-Credentials: true
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  preflightContinue: false, // let the cors middleware send the preflight response
  optionsSuccessStatus: 204,
};

// Apply global CORS
app.use(cors(corsOptions));
// Ensure all OPTIONS preflight requests are handled
app.options("*", cors(corsOptions));

/* ================== LOGGER (dev) ================== */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* ================== UPLOADS (static) ================== */
/*
  - Make sure ./uploads exists. In production prefer object storage (S3 / Spaces / GCS).
  - We set per-file headers to allow cross-origin embedding of images and to provide ACAO.
*/
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const staticUploadsOptions = {
  setHeaders: (res, filePath, stat) => {
    // Prefer explicit FRONTEND_URL for credentials; fall back to allowedOrigins[0]
    const frontend = process.env.FRONTEND_URL || allowedOrigins[0] || "*";

    // If we're serving to a known frontend and credentials are used, set that origin explicitly.
    // Note: do NOT set ACAO to '*' when sending Access-Control-Allow-Credentials: true
    res.setHeader("Access-Control-Allow-Origin", frontend);
    // Allow embedding across origins (prevents NotSameOrigin CORP blocking)
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    // If we are setting an explicit origin (not '*'), allow credentials
    if (frontend !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  },
};

// Optional debug middleware to log requested uploads (uncomment for debugging only)
// app.use('/uploads', (req, res, next) => {
//   console.log('[uploads] requested:', req.method, req.url);
//   next();
// }, express.static(uploadsDir, staticUploadsOptions));

app.use("/uploads", express.static(uploadsDir, staticUploadsOptions));

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

// Error handling middleware (keep after routes)
app.use(notFound);
app.use(errorHandler);

/* ================== SOCKET.IO SETUP ================== */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      // Socket.IO cors origin handling -- allow same allowedOrigins
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

// Make io accessible in controllers
app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

/* ================== START SERVER ================== */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* ================== PRODUCTION NOTE ==================
  If this app is deployed on Render/Heroku/etc, the local `uploads/` folder is ephemeral
  (files disappear on redeploy / instance restart). For production consider:
   - Using S3 / DigitalOcean Spaces / Google Cloud Storage for uploaded assets
   - Serving uploads via CDN
   - Storing canonical public URLs in DB rather than local filesystem paths
======================================================== */

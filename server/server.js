/* ================== SERVER.JS (fixed for Express 5 CORS) ================== */
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
const allowedOrigins = [
  "http://localhost:5173", // local dev
  process.env.FRONTEND_URL || "https://techstore-tau.vercel.app", // production
  // Add "https://www.techstore-tau.vercel.app" if needed
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log("🔍 CORS origin:", origin); // Debug log
    if (!origin) return callback(null, true); // allow curl / server-to-server
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply global CORS
app.use(cors(corsOptions));
// ✅ Fixed for Express 5: use RegExp instead of "/api/*"
app.options(/^\/api\/.*$/, cors(corsOptions));

/* ================== LOGGER (dev) ================== */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* ================== UPLOADS (static) ================== */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const staticUploadsOptions = {
  setHeaders: (res, filePath, stat) => {
    const frontend = process.env.FRONTEND_URL || allowedOrigins[0] || "*";
    res.setHeader("Access-Control-Allow-Origin", frontend);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (frontend !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  },
};

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

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

/* ================== SOCKET.IO SETUP ================== */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      console.log("🔍 Socket.IO CORS origin:", origin); // Debug log
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  },
});

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

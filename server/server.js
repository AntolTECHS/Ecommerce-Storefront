/* ================== SERVER.JS ================== */
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

// CORS setup: allow both localhost (dev) and Vercel frontend (prod)
const allowedOrigins = [
  "http://localhost:5173", // local dev
  process.env.FRONTEND_URL || "https://techstore-tau.vercel.app", // production
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Logger (only in development)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files (static) with permissive cross-origin headers
const staticUploadsOptions = {
  setHeaders: (res, filePath, stat) => {
    // Use explicit frontend origin if possible (do NOT use '*' when you're using credentials)
    const frontend = process.env.FRONTEND_URL || allowedOrigins[0] || '*';
    res.setHeader('Access-Control-Allow-Origin', frontend);
    // Allow browsers to embed images cross-origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Allow credentials only if frontend is explicit (not '*')
    if (frontend !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  },
};

// Optional debug middleware: uncomment to log requests to /uploads during debugging
// app.use('/uploads', (req, res, next) => {
//   console.log('[uploads] requested:', req.method, req.url);
//   next();
// }, express.static(uploadsDir, staticUploadsOptions));

app.use('/uploads', express.static(uploadsDir, staticUploadsOptions));

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
    origin: allowedOrigins,
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

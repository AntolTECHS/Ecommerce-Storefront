/* ================== server.js (final) ================== */
'use strict';

const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load env
dotenv.config();

// QUICK sanity: require MONGO_URI
if (!process.env.MONGO_URI) {
  console.error('❌ Missing MONGO_URI in environment. Set MONGO_URI and restart.');
  process.exit(1);
}

// Connect DB
connectDB();

// Express app
const app = express();

// If you run behind proxies (Heroku/Render/nginx), consider enabling trust proxy
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ================== CORS setup ================== */
/* Build allowed origins set from env + common dev hosts */
const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
if (frontendUrl) allowedOrigins.add(frontendUrl);

// CORS options validator (won't crash if origin is undefined — allows curl/server requests)
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server, mobile, curl
    const o = origin.replace(/\/$/, '');
    if (allowedOrigins.has(o)) return callback(null, true);
    if (o.includes('localhost') || o.includes('127.0.0.1')) return callback(null, true);
    console.warn(`[CORS] blocked origin: ${origin}`);
    return callback(new Error(`CORS policy: origin ${origin} not allowed`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

// Register CORS globally
app.use(cors(corsOptions));

/* SAFER preflight handling:
   Some express/path-to-regexp combos can choke on app.options('*', ...) - avoid calling that.
   Instead, handle preflight via a small middleware that runs CORS for OPTIONS requests. */
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Run CORS for preflight — this will set appropriate headers
    return cors(corsOptions)(req, res, next);
  }
  next();
});

/* ================== Logging ================== */
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

/* ================== Rate limiting (global mild protection) ================== */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

/* ================== Uploads folder (static) ================== */
const uploadsDir = path.join(__dirname, 'uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn('[startup] could not ensure uploads dir:', err && err.message ? err.message : err);
}

// Ensure CORS headers are present for /uploads responses even on 404s.
// This middleware sets CORS headers for the uploads route before express.static handles it.
app.use('/uploads', (req, res, next) => {
  // Set Access-Control-Allow-Origin for browsers (match frontend if available)
  const allow = frontendUrl || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Allow other preflight headers as needed
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  next();
});

// Serve static uploads (files should exist on disk OR be uploaded via your admin/product handlers)
app.use('/uploads', express.static(uploadsDir, { extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }));

/* ================== Startup diagnostics (mail + frontend) ================== */
(function startupChecks() {
  if (!frontendUrl) {
    console.warn('[startup] FRONTEND_URL / CLIENT_URL not set. Reset links may point to localhost.');
  } else {
    console.info('[startup] FRONTEND_URL =', frontendUrl);
  }

  const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY);
  const hasSMTP = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  if (!hasSendGrid && !hasSMTP) {
    console.warn('[startup] No mail provider configured (SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS). Password reset emails will fail.');
  } else {
    if (hasSendGrid) console.info('[startup] SendGrid API key detected - SendGrid will be used when configured.');
    if (hasSMTP) console.info('[startup] SMTP credentials detected - Nodemailer will attempt SMTP send.');
  }

  if (!process.env.FROM_EMAIL) {
    console.warn('[startup] FROM_EMAIL not set - emails will use fallback no-reply address.');
  }
})();

/* ================== Mount routes ================== */
/* NOTE: these files must exist (you provided them earlier) */
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const contactRoutes = require('./routes/contactRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes);

// Health check / root
app.get('/', (req, res) => res.send('API is running...'));

/* ================== Error handlers ================== */
app.use(notFound);
app.use(errorHandler);

/* ================== Socket.IO ================== */
const server = http.createServer(app);

// Build Socket.IO cors origins array from allowedOrigins set
const ioOrigins = Array.from(allowedOrigins).map(String);

const io = new Server(server, {
  cors: {
    origin: ioOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('🔴 Socket disconnected:', socket.id));
});

/* ================== Start server ================== */
const PORT = Number(process.env.PORT || 5000);
server.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

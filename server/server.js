/* ================== server.js (updated) ================== */
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

// Load environment variables
dotenv.config();

// Minimal required config check
if (!process.env.MONGO_URI) {
  console.error('❌ Missing MONGO_URI in environment');
  process.exit(1);
}

// Connect to MongoDB
connectDB();

// Create app
const app = express();

// If running behind a proxy (Heroku, nginx), enable trust proxy so secure cookies / IPs work
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet());

// JSON + URL-encoded body parsers (increase limit slightly for uploads via form-data if needed)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ========== CORS setup ========== */
// allow local dev + production frontend(s)
const frontend = process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.RESET_URL_BASE || '';
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

if (frontend) allowedOrigins.add(frontend.replace(/\/$/, ''));

// dynamic origin validator so we can easily accept additional origins during dev
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // allow if exact match in allowedOrigins
    if (allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
    // also allow same-host requests (useful for some proxies)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
    const msg = `CORS policy: origin ${origin} not allowed`;
    console.warn(msg);
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));

// --- SAFER preflight handling (avoids registering app.options('*', ...))
// Some path-to-regexp / express versions choke on '*' when used in route registration.
// Instead of app.options('*', cors(corsOptions)) we handle OPTIONS at middleware level.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // run CORS middleware for preflight, then end the response if headers were set
    return cors(corsOptions)(req, res, next);
  }
  next();
});

/* ========== Logging ========== */
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

/* ========== Rate limiting (global mild protection) ========== */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // maximum requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

/* ========== Uploads static dir ========== */
const uploadsDir = path.join(__dirname, 'uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
  console.warn('Could not ensure uploads dir:', e.message || e);
}
app.use('/uploads', express.static(uploadsDir));

/* ========== Helpful startup diagnostics for mail & frontend config ========== */
(function startupChecks() {
  if (!frontend) {
    console.warn('[startup] FRONTEND_URL / CLIENT_URL / RESET_URL_BASE is not set; reset links may point to localhost.');
  } else {
    console.info('[startup] FRONTEND_URL =', frontend);
  }

  const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY);
  const hasSMTP = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  if (!hasSendGrid && !hasSMTP) {
    console.warn('[startup] No mail provider configured (SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS). Password reset emails will fail.');
  } else {
    if (hasSendGrid) console.info('[startup] SendGrid API key detected - using SendGrid where configured.');
    if (hasSMTP) console.info('[startup] SMTP settings detected - Nodemailer will attempt SMTP send.');
  }

  if (!process.env.FROM_EMAIL) {
    console.warn('[startup] FROM_EMAIL not set - using fallback no-reply address.');
  }
})();

/* ========== ROUTES (mount) ========== */
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

// Root health-check
app.get('/', (req, res) => res.send('API is running...'));

/* ========== Error middleware ========== */
app.use(notFound);
app.use(errorHandler);

/* ========== Socket.IO ========== */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: Array.from(new Set([...allowedOrigins])).map(s => String(s)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('🔴 Socket disconnected:', socket.id));
});

/* ========== Start server ========== */
const PORT = Number(process.env.PORT || 5000);
server.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

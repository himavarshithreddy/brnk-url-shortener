const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const rateLimit = require('express-rate-limit');
const linkRoutes = require('./routes/linkRoutes');
const { proxyDetection } = require('./middleware/security');

dotenv.config();

const app = express();

app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Middleware ordering is critical for performance.
// The redirect path (GET /:shortCode) is the hottest endpoint. We structure
// the middleware so that heavy processing (JSON body parsing, CORS preflight)
// is only applied to routes that need it, while the redirect path stays lean.
// ---------------------------------------------------------------------------

// Security headers – lightweight, applied globally
app.use(helmet());

const corsOptions = {
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Proxy detection – lightweight IP extraction applied globally
app.use(proxyDetection);

// JSON body parsing – only needed for POST requests.
// Splitting this out avoids parsing overhead on every redirect GET.
app.use((req, res, next) => {
  if (req.method === 'POST') {
    return express.json({ limit: '10kb' })(req, res, next);
  }
  next();
});

const faviconLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.get('/favicon.svg', faviconLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

app.use('/', linkRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

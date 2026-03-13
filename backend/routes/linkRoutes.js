const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { createShortUrl, getOriginalUrl, trackClicks, healthCheck, monitoringDashboard, getLinkInfo } = require('../controllers/linkController');
const { rateLimitKeyGenerator } = require('../middleware/security');
const { creationRateLimiter } = require('../middleware/rateLimiter');
const { urlSafetyCheck, googleSafeBrowsingCheck } = require('../middleware/urlSafety');
const { captchaVerification } = require('../middleware/captcha');
const { killSwitchMiddleware } = require('../middleware/monitoring');

// Rate limiter for URL creation - stricter limit, IP-based (fallback layer)
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  message: { error: 'Too many requests. Please try again later.' },
});

// Rate limiter for general requests, IP-based
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  message: { error: 'Too many requests. Please try again later.' },
});

// Health check route
router.get('/health', healthCheck);

// Monitoring dashboard route (protected by API key if configured)
router.get('/monitoring/dashboard', (req, res, next) => {
  const apiKey = process.env.MONITORING_API_KEY;
  if (apiKey && req.headers['x-api-key'] !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}, monitoringDashboard);

// Link info route for interstitial page
router.get('/link-info/:shortCode', generalLimiter, getLinkInfo);

// Route to create short URL (with layered security middleware)
router.post('/shorten',
  createLimiter,          // express-rate-limit fallback
  killSwitchMiddleware,   // global kill switch check
  creationRateLimiter,    // advanced per-IP/subnet/UA rate limiting
  urlSafetyCheck,         // URL safety scanning & domain trust scoring
  googleSafeBrowsingCheck, // Google Safe Browsing API (optional)
  captchaVerification,    // CAPTCHA for suspicious requests (optional)
  createShortUrl
);

// Route to track clicks (must be before the catch-all /:shortCode route)
router.get('/track/:shortCode', generalLimiter, trackClicks);

// Root route for backend service checks
router.get('/', (req, res) => {
  res
    .status(403)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Access Restricted | BRNK</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1220; color: #e5e7eb;">
  <main style="text-align: center; max-width: 560px; padding: 24px;">
    <h1 style="margin-bottom: 12px; color: #ffffff;">Access Restricted</h1>
    <p style="margin: 0; line-height: 1.6;">This backend endpoint is not authorized for direct browsing. Please use <strong>BRNK.in</strong> to create and manage links.</p>
  </main>
</body>
</html>`);
});

// Route to get the original URL (catch-all, must be last)
router.get('/:shortCode', generalLimiter, getOriginalUrl);

module.exports = router;

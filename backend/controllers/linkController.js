const { createLink, getRedirectRecord, findByShortCode, incrementClickCount, getClickCount, checkRedisConnection, ensureReady } = require('../models/Link');
const { customAlphabet } = require('nanoid');
const { recordLinkCreation, recordRedirect, detectClickAnomaly, getDashboardData } = require('../middleware/monitoring');

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 31_536_000; // 1 year
const VALID_REDIRECT_TYPES = new Set(['301', '302', '308']);
const SHORT_CODE_LENGTH = 4;
const SHORT_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const generateShortCode = customAlphabet(SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH);

// Pre-compiled regex – avoids re-compilation on every request
const VALID_SHORT_CODE_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_CUSTOM_CODE_RE = /^[a-zA-Z0-9-]+$/;

// ---------------------------------------------------------------------------
// Short-code pre-generation pool
// Generates codes in background so the creation path never blocks on nanoid.
// ---------------------------------------------------------------------------
const CODE_POOL_SIZE = 256;
const CODE_POOL_REFILL = 192;
const codePool = [];

function refillCodePool() {
  while (codePool.length < CODE_POOL_SIZE) {
    codePool.push(generateShortCode());
  }
}
refillCodePool();

function getPooledCode() {
  if (codePool.length === 0) {
    return generateShortCode();
  }
  const code = codePool.pop();
  if (codePool.length < CODE_POOL_REFILL) {
    // Schedule async refill on next tick to avoid blocking
    setImmediate(refillCodePool);
  }
  return code;
}

// Pre-allocated header objects to avoid per-request object creation
const CACHE_HEADERS_PERMANENT = { 'Cache-Control': 'public, max-age=86400, immutable' };
const CACHE_HEADERS_NOSTORE = { 'Cache-Control': 'no-store' };

// Bot user-agent detection for link metadata unfurling (OG tags)
const BOT_UA_RE = /Twitterbot|Slackbot|Discordbot|WhatsApp|facebookexternalhit|LinkedInBot|Googlebot|bingbot|TelegramBot|Applebot|Pinterestbot/i;

/**
 * Generate HTML with OpenGraph meta tags for bot crawlers.
 */
function generateOgHtml(originalUrl, shortCode) {
  let domain;
  try {
    domain = new URL(originalUrl).hostname;
  } catch {
    domain = originalUrl;
  }
  // Escape HTML special characters to prevent XSS
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeDomain = esc(domain);
  const safeCode = esc(shortCode);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${safeDomain} — brnk short link</title>
<meta property="og:title" content="${safeDomain}"/>
<meta property="og:description" content="Shortened link via brnk — click to visit ${safeDomain}"/>
<meta property="og:url" content="https://brnk.in/${safeCode}"/>
<meta property="og:site_name" content="brnk"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${safeDomain}"/>
<meta name="twitter:description" content="Shortened link via brnk — click to visit ${safeDomain}"/>
</head>
<body></body>
</html>`;
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const createShortUrl = async (req, res) => {
  const { originalUrl, customShortCode, ttl, redirectType, maxClicks } = req.body;

  if (!originalUrl || typeof originalUrl !== 'string') {
    return res.status(400).json({ error: 'Original URL is required' });
  }

  if (originalUrl.length > 2048) {
    return res.status(400).json({ error: 'URL is too long (max 2048 characters)' });
  }

  if (!isValidUrl(originalUrl)) {
    return res.status(400).json({ error: 'Invalid URL format. Must start with http:// or https://' });
  }

  if (customShortCode) {
    if (!VALID_CUSTOM_CODE_RE.test(customShortCode)) {
      return res.status(400).json({ error: 'Short code can only contain letters, numbers, and hyphens' });
    }
    if (customShortCode.length > 20) {
      return res.status(400).json({ error: 'Short code must be 20 characters or fewer' });
    }
  }

  const resolvedRedirectType = redirectType && VALID_REDIRECT_TYPES.has(String(redirectType))
    ? String(redirectType)
    : '308';

  // Use the pre-generated pool for random codes
  const shortCode = customShortCode || getPooledCode();

  let ttlSeconds = null;
  if (ttl) {
    ttlSeconds = parseInt(ttl, 10);
    if (isNaN(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS) {
      return res.status(400).json({ error: `TTL must be at least ${MIN_TTL_SECONDS} seconds` });
    }
    if (ttlSeconds > MAX_TTL_SECONDS) {
      return res.status(400).json({ error: `TTL must not exceed 1 year (${MAX_TTL_SECONDS} seconds)` });
    }
  }

  // Validate maxClicks (0 = unlimited)
  let resolvedMaxClicks = 0;
  if (maxClicks !== undefined && maxClicks !== null && maxClicks !== '') {
    resolvedMaxClicks = parseInt(maxClicks, 10);
    if (isNaN(resolvedMaxClicks) || resolvedMaxClicks < 0) {
      return res.status(400).json({ error: 'maxClicks must be a non-negative integer' });
    }
  }

  try {
    await ensureReady();
    const link = await createLink(shortCode, originalUrl, ttlSeconds, resolvedRedirectType, resolvedMaxClicks);
    if (!link) {
      return res.status(400).json({ error: 'Shortcode already exists' });
    }

    const clientIp = req.securityMeta?.clientIp || req.ip || 'unknown';
    recordLinkCreation(shortCode, originalUrl, clientIp);

    res.json({ shortCode, originalUrl, expiresAt: link.expiresAt, maxClicks: resolvedMaxClicks });
  } catch (err) {
    if (err.message === 'Redis connection is not available') {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
    }
    console.error('Error creating short URL:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// Redirect handler – the absolute hot path.
// Every microsecond here matters because this runs on every link click.
// Optimisations:
//   1. ensureReady() resolves synchronously after first call (no await overhead)
//   2. record.r is already an integer (normalised in Link model)
//   3. Pre-allocated header objects avoid per-request object creation
//   4. Monitoring/analytics run fire-and-forget after res.end()
// ---------------------------------------------------------------------------
const getOriginalUrl = async (req, res) => {
  const { shortCode } = req.params;

  if (!shortCode || !VALID_SHORT_CODE_RE.test(shortCode)) {
    return res.status(404).json({ error: 'Link not found' });
  }

  try {
    await ensureReady();
    const record = await getRedirectRecord(shortCode);

    if (!record) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (record.t > 0 && Date.now() > record.t) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (record.e !== 1) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // Bot detection – return OG meta tags for link unfurling instead of redirect
    const ua = req.headers['user-agent'] || '';
    if (BOT_UA_RE.test(ua)) {
      const html = generateOgHtml(record.u, shortCode);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set(CACHE_HEADERS_NOSTORE);
      return res.status(200).send(html);
    }

    // maxClicks enforcement – check before redirecting
    if (record.mc > 0) {
      const newCount = await incrementClickCount(shortCode);
      if (newCount > record.mc) {
        return res.status(410).json({ error: 'Link has reached its maximum number of clicks' });
      }

      // record.r is already an integer (normalised at cache/fetch time)
      const statusCode = record.r || 308;
      res.set('Location', record.u);
      if (statusCode === 301 || statusCode === 308) {
        res.set(CACHE_HEADERS_PERMANENT);
      } else {
        res.set(CACHE_HEADERS_NOSTORE);
      }
      res.status(statusCode).end();

      // Fire-and-forget analytics (click already incremented above)
      recordRedirect(shortCode);
      if (detectClickAnomaly(shortCode)) {
        console.warn(`[ANOMALY] Link ${shortCode} has anomalous click volume`);
      }
      return;
    }

    // record.r is already an integer (normalised at cache/fetch time)
    const statusCode = record.r || 308;

    // Send redirect with pre-allocated headers
    res.set('Location', record.u);
    if (statusCode === 301 || statusCode === 308) {
      res.set(CACHE_HEADERS_PERMANENT);
    } else {
      res.set(CACHE_HEADERS_NOSTORE);
    }
    res.status(statusCode).end();

    // Fire-and-forget analytics after the response is sent
    incrementClickCount(shortCode).catch(() => {});
    recordRedirect(shortCode);

    if (detectClickAnomaly(shortCode)) {
      console.warn(`[ANOMALY] Link ${shortCode} has anomalous click volume`);
    }
  } catch (err) {
    if (err.message === 'Redis connection is not available') {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
    }
    console.error('Error redirecting:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const trackClicks = async (req, res) => {
  const { shortCode } = req.params;

  try {
    await ensureReady();
    const link = await findByShortCode(shortCode);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json({
      originalUrl: link.originalUrl,
      shortCode: link.shortCode,
      clicks: link.clickCount,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    if (err.message === 'Redis connection is not available') {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
    }
    console.error('Error tracking clicks:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Health check controller
const healthCheck = async (req, res) => {
  const redisOk = await checkRedisConnection();
  const status = redisOk ? 'healthy' : 'degraded';
  const statusCode = redisOk ? 200 : 503;

  res.status(statusCode).json({
    status,
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
};

// Monitoring dashboard controller
const monitoringDashboard = async (req, res) => {
  res.json(getDashboardData());
};

// Link info controller (for interstitial/preview page)
const getLinkInfo = async (req, res) => {
  const { shortCode } = req.params;

  if (!shortCode || !VALID_SHORT_CODE_RE.test(shortCode)) {
    return res.status(404).json({ error: 'Link not found' });
  }

  try {
    await ensureReady();
    const record = await getRedirectRecord(shortCode);

    if (!record) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (record.t > 0 && Date.now() > record.t) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (record.e !== 1) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { calculateDomainTrustScore } = require('../middleware/urlSafety');
    const trustScore = calculateDomainTrustScore(record.u);

    // Determine if interstitial warning is needed
    const isNewLink = record.ca && (Date.now() - new Date(record.ca).getTime()) < 24 * 60 * 60 * 1000;
    const showWarning = trustScore < 50 || isNewLink;

    // Fetch click count for the preview page
    const clickCount = await getClickCount(shortCode);

    let domain;
    try {
      domain = new URL(record.u).hostname;
    } catch {
      domain = record.u;
    }

    res.json({
      originalUrl: record.u,
      shortCode,
      domain,
      trustScore,
      showWarning,
      warningReason: showWarning
        ? (trustScore < 50 ? 'low_trust_domain' : 'newly_created')
        : null,
      createdAt: record.ca || null,
      expiresAt: record.t ? new Date(record.t).toISOString() : null,
      clickCount,
      maxClicks: record.mc || 0,
    });
  } catch (err) {
    if (err.message === 'Redis connection is not available') {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
    }
    console.error('Error getting link info:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createShortUrl,
  getOriginalUrl,
  trackClicks,
  healthCheck,
  monitoringDashboard,
  getLinkInfo,
};

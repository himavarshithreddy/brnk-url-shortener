/**
 * Advanced rate limiting middleware with tiered limits, subnet tracking,
 * user-agent throttling, and progressive backoff.
 *
 * Performance optimisations:
 *   - Bucket arrays use in-place pruning with a write pointer instead of
 *     Array.filter() which allocates a new array every time.
 *   - Suspicious-UA check uses a single combined regex to avoid iterating
 *     an array of patterns.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const PER_IP_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MIN, 10) || 5;
const PER_IP_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR, 10) || 50;
const PER_SUBNET_PER_MINUTE = parseInt(process.env.RATE_LIMIT_SUBNET_PER_MIN, 10) || 30;
const PER_SUBNET_PER_HOUR = parseInt(process.env.RATE_LIMIT_SUBNET_PER_HOUR, 10) || 200;

const BACKOFF_THRESHOLDS = [
  { violations: 3, blockMs: 5 * MINUTE },
  { violations: 6, blockMs: 30 * MINUTE },
  { violations: 10, blockMs: HOUR },
  { violations: 20, blockMs: 24 * HOUR },
];

// Single combined regex is faster than iterating an array of patterns
const SUSPICIOUS_UA_RE = /^$|curl|wget|python-requests|httpie|scrapy|bot(?!tle)|spider|crawl|headless|phantom|selenium|puppeteer/i;

const UA_THROTTLE_FACTOR = 0.5;

const ipBuckets = new Map();
const subnetBuckets = new Map();
const violations = new Map();

const MAX_TRACKED_IPS = 100_000;
const CLEANUP_INTERVAL = 5 * MINUTE;

// Pre-compiled regex for subnet extraction
const V4_SUBNET_RE = /(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/i;

function getSubnet(ip) {
  if (!ip) return 'unknown';
  const v4Match = ip.match(V4_SUBNET_RE);
  if (v4Match) return v4Match[1] + '.0/24';
  const parts = ip.split(':');
  if (parts.length >= 3) return parts.slice(0, 3).join(':') + '::/48';
  return ip;
}

function isSuspiciousUA(ua) {
  if (!ua) return true;
  return SUSPICIOUS_UA_RE.test(ua);
}

function getBucket(store, key) {
  let bucket = store.get(key);
  if (!bucket) {
    if (store.size >= MAX_TRACKED_IPS) {
      const firstKey = store.keys().next().value;
      store.delete(firstKey);
    }
    bucket = { minute: [], hour: [] };
    store.set(key, bucket);
  }
  return bucket;
}

/**
 * In-place prune: compact the array by removing expired entries without
 * allocating a new array.  Returns the new logical length.
 */
function pruneInPlace(arr, cutoff) {
  let write = 0;
  for (let read = 0; read < arr.length; read++) {
    if (arr[read] >= cutoff) {
      arr[write++] = arr[read];
    }
  }
  arr.length = write;
}

function checkBucket(bucket, now, perMinute, perHour) {
  pruneInPlace(bucket.minute, now - MINUTE);
  pruneInPlace(bucket.hour, now - HOUR);

  if (bucket.minute.length >= perMinute) {
    const oldest = bucket.minute[0];
    return { allowed: false, retryAfterMs: MINUTE - (now - oldest) };
  }

  if (bucket.hour.length >= perHour) {
    const oldest = bucket.hour[0];
    return { allowed: false, retryAfterMs: HOUR - (now - oldest) };
  }

  bucket.minute.push(now);
  bucket.hour.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Check and update violation tracking for progressive backoff.
 */
function checkViolations(ip, now) {
  let record = violations.get(ip);
  if (!record) {
    record = { count: 0, blockedUntil: 0 };
    violations.set(ip, record);
  }

  // Currently blocked?
  if (record.blockedUntil > now) {
    return { blocked: true, retryAfterMs: record.blockedUntil - now };
  }

  return { blocked: false, retryAfterMs: 0 };
}

function recordViolation(ip, now) {
  let record = violations.get(ip);
  if (!record) {
    record = { count: 0, blockedUntil: 0 };
    violations.set(ip, record);
  }

  record.count++;

  // Find the appropriate backoff duration
  let blockMs = 0;
  for (const threshold of BACKOFF_THRESHOLDS) {
    if (record.count >= threshold.violations) {
      blockMs = threshold.blockMs;
    }
  }

  if (blockMs > 0) {
    record.blockedUntil = now + blockMs;
  }

  violations.set(ip, record);
}

/**
 * Express middleware for creation endpoint rate limiting.
 * Implements per-IP, per-subnet, UA-based throttling, and progressive backoff.
 */
function creationRateLimiter(req, res, next) {
  const ip = req.securityMeta?.clientIp || req.ip || 'unknown';
  const subnet = getSubnet(ip);
  const ua = req.headers['user-agent'] || '';
  const now = Date.now();
  const suspicious = isSuspiciousUA(ua);
  const factor = suspicious ? UA_THROTTLE_FACTOR : 1;

  // 1. Check progressive backoff (is IP currently blocked?)
  const violationCheck = checkViolations(ip, now);
  if (violationCheck.blocked) {
    const retryAfter = Math.ceil(violationCheck.retryAfterMs / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'You have been temporarily blocked due to excessive requests. Please try again later.',
    });
  }

  // 2. Per-IP rate check
  const ipBucket = getBucket(ipBuckets, ip);
  const ipCheck = checkBucket(
    ipBucket, now,
    Math.floor(PER_IP_PER_MINUTE * factor),
    Math.floor(PER_IP_PER_HOUR * factor)
  );

  if (!ipCheck.allowed) {
    recordViolation(ip, now);
    const retryAfter = Math.ceil(ipCheck.retryAfterMs / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
    });
  }

  // 3. Per-subnet rate check
  const snBucket = getBucket(subnetBuckets, subnet);
  const snCheck = checkBucket(snBucket, now, PER_SUBNET_PER_MINUTE, PER_SUBNET_PER_HOUR);

  if (!snCheck.allowed) {
    const retryAfter = Math.ceil(snCheck.retryAfterMs / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Too many requests from your network. Please try again later.',
    });
  }

  // Attach suspicion score for downstream middleware
  req.securityMeta = req.securityMeta || {};
  req.securityMeta.suspiciousUA = suspicious;

  next();
}

function cleanup() {
  const now = Date.now();
  const minuteCutoff = now - MINUTE;
  const hourCutoff = now - HOUR;

  for (const [key, bucket] of ipBuckets) {
    pruneInPlace(bucket.minute, minuteCutoff);
    pruneInPlace(bucket.hour, hourCutoff);
    if (bucket.minute.length === 0 && bucket.hour.length === 0) {
      ipBuckets.delete(key);
    }
  }

  for (const [key, bucket] of subnetBuckets) {
    pruneInPlace(bucket.minute, minuteCutoff);
    pruneInPlace(bucket.hour, hourCutoff);
    if (bucket.minute.length === 0 && bucket.hour.length === 0) {
      subnetBuckets.delete(key);
    }
  }

  for (const [key, record] of violations) {
    if (record.blockedUntil < now && now - record.blockedUntil > HOUR) {
      violations.delete(key);
    }
  }
}

const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Graceful shutdown: clear the cleanup timer.
 */
function shutdown() {
  clearInterval(cleanupTimer);
}

module.exports = {
  creationRateLimiter,
  getSubnet,
  isSuspiciousUA,
  shutdown,
  // Exposed for testing
  _ipBuckets: ipBuckets,
  _subnetBuckets: subnetBuckets,
  _violations: violations,
};

const { Redis } = require('@upstash/redis');

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (err) {
  console.error('Failed to initialize Redis client:', err.message,
    '- Ensure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are set.');
}

const LINK_PREFIX = 'l:';
const CLICKS_PREFIX = 'clicks:';
const URL_INDEX_PREFIX = 'u:';

// ---------------------------------------------------------------------------
// L1 in-process memory cache – optimised with typed expiry slots
// ---------------------------------------------------------------------------
// Uses a flat Map where each entry stores { val, exp }.
// `val === false` represents a negative-cached miss.
// Eviction: FIFO via insertion order when capacity is reached.  On access the
// entry is moved to the tail so frequently-hit codes survive longer (LRU-like).
// ---------------------------------------------------------------------------
const l1Cache = new Map();
const L1_TTL_MS = 30_000;
const L1_MAX_SIZE = 50_000;
const L1_MISS_TTL_MS = 10_000;

// Batch eviction count – amortises eviction cost under burst traffic
const L1_EVICT_BATCH = 64;

function l1Get(code) {
  const entry = l1Cache.get(code);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    l1Cache.delete(code);
    return null;
  }
  // Promote to tail (LRU refresh) – delete + set is the fastest
  // way to move a key to the end of a Map's insertion order.
  l1Cache.delete(code);
  l1Cache.set(code, entry);
  return entry.val;
}

function l1Set(code, value, ttlMs = L1_TTL_MS) {
  if (l1Cache.size >= L1_MAX_SIZE) {
    // Evict a batch at once to avoid per-insert overhead under pressure
    const iter = l1Cache.keys();
    for (let i = 0; i < L1_EVICT_BATCH; i++) {
      const k = iter.next();
      if (k.done) break;
      l1Cache.delete(k.value);
    }
  }
  l1Cache.set(code, { val: value, exp: Date.now() + ttlMs });
}

function l1Delete(code) {
  l1Cache.delete(code);
}

// Periodic sweep of expired entries to reclaim memory proactively.
const l1CleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of l1Cache) {
    if (now > entry.exp) l1Cache.delete(key);
  }
}, 60_000);
if (l1CleanupTimer.unref) l1CleanupTimer.unref();

// ---------------------------------------------------------------------------
// Redis helpers
// ---------------------------------------------------------------------------

async function checkRedisConnection() {
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new shortened link in Redis.
 * Record fields: u (url), t (expiry epoch ms, 0=never), e (enabled), p (protected),
 *                r (redirect type as int), ca (createdAt ISO)
 *
 * Also maintains a reverse index (u:<url> -> shortCode) so that the same
 * URL submitted without a custom code returns the existing mapping
 * (idempotent creation).
 */
async function createLink(shortCode, originalUrl, ttlSeconds = null, redirectType = '308', maxClicks = 0) {
  if (!redis) throw new Error('Redis connection is not available');
  const key = `${LINK_PREFIX}${shortCode}`;

  const now = Date.now();
  const expiresTimestamp = ttlSeconds ? now + ttlSeconds * 1000 : 0;

  // Store redirect type as integer to skip parseInt on the hot redirect path.
  const rInt = Number(redirectType) || 308;

  const record = {
    u: originalUrl,
    t: expiresTimestamp,
    e: 1,
    p: 0,
    r: rInt,
    ca: new Date(now).toISOString(),
    mc: Number(maxClicks) || 0,
  };

  const setOptions = ttlSeconds ? { nx: true, ex: ttlSeconds } : { nx: true };
  const setResult = await redis.set(key, record, setOptions);

  if (setResult === null) return null;

  // Eagerly populate L1 cache so the first redirect is served from memory
  l1Set(shortCode, record);

  // Maintain reverse URL index for idempotent creation
  const urlKey = `${URL_INDEX_PREFIX}${originalUrl}`;
  const urlSetOptions = ttlSeconds ? { ex: ttlSeconds } : {};
  redis.set(urlKey, shortCode, urlSetOptions).catch((err) => {
    console.error('Failed to set reverse URL index:', err.message);
  });

  return {
    shortCode,
    originalUrl,
    expiresAt: expiresTimestamp ? new Date(expiresTimestamp).toISOString() : null,
  };
}

/**
 * Look up an existing short code for a URL via the reverse index.
 * Returns { shortCode, originalUrl, expiresAt } if found and still valid, null otherwise.
 */
async function findByOriginalUrl(originalUrl) {
  if (!redis) throw new Error('Redis connection is not available');

  const urlKey = `${URL_INDEX_PREFIX}${originalUrl}`;
  const existingCode = await redis.get(urlKey);
  if (!existingCode) return null;

  // Verify the link still exists and is valid
  const record = await getRedirectRecord(existingCode);
  if (!record) return null;
  if (record.e !== 1) return null;
  if (record.t > 0 && Date.now() > record.t) return null;

  return {
    shortCode: existingCode,
    originalUrl: record.u,
    expiresAt: record.t ? new Date(record.t).toISOString() : null,
  };
}

/**
 * Fast-path: L1 cache → single Redis GET.
 * Negative misses are cached with a shorter TTL.
 */
async function getRedirectRecord(shortCode) {
  if (!redis) throw new Error('Redis connection is not available');

  const cached = l1Get(shortCode);
  if (cached !== null) return cached === false ? null : cached;

  const raw = await redis.get(`${LINK_PREFIX}${shortCode}`);

  if (!raw) {
    l1Set(shortCode, false, L1_MISS_TTL_MS);
    return null;
  }

  const record = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // Normalise redirect type to integer once on fetch
  if (typeof record.r === 'string') record.r = Number(record.r) || 308;

  l1Set(shortCode, record);
  return record;
}

/**
 * Full link info (tracking endpoint – not latency-critical).
 */
async function findByShortCode(shortCode) {
  if (!redis) throw new Error('Redis connection is not available');

  const pipeline = redis.pipeline();
  pipeline.get(`${LINK_PREFIX}${shortCode}`);
  pipeline.get(`${CLICKS_PREFIX}${shortCode}`);
  const [rawRecord, clicks] = await pipeline.exec();

  if (!rawRecord) return null;
  const record = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord;
  return {
    shortCode,
    originalUrl: record.u,
    clickCount: Number(clicks) || 0,
    createdAt: record.ca || null,
    expiresAt: record.t ? new Date(record.t).toISOString() : null,
    maxClicks: record.mc || 0,
  };
}

// ---------------------------------------------------------------------------
// Click batching – reduces Redis write operations under high traffic.
// Clicks are buffered in memory and flushed periodically or when the
// buffer reaches a threshold.  This trades sub-second click accuracy
// for significantly lower Redis write load at scale.
// ---------------------------------------------------------------------------
const clickBuffer = new Map();        // shortCode -> pending count
const CLICK_FLUSH_INTERVAL_MS = 5_000;
const CLICK_FLUSH_THRESHOLD = 50;     // flush a code early if it has this many pending
const CLICK_BUFFER_MAX_SIZE = 10_000; // cap total entries to prevent memory exhaustion

async function flushClickBuffer() {
  if (!redis || clickBuffer.size === 0) return;
  const batch = Array.from(clickBuffer.entries());
  clickBuffer.clear();

  const pipeline = redis.pipeline();
  for (const [code, count] of batch) {
    pipeline.incrby(`${CLICKS_PREFIX}${code}`, count);
  }
  try {
    await pipeline.exec();
  } catch (err) {
    // On failure, put clicks back so they aren't lost
    for (const [code, count] of batch) {
      clickBuffer.set(code, (clickBuffer.get(code) || 0) + count);
    }
  }
}

const clickFlushTimer = setInterval(flushClickBuffer, CLICK_FLUSH_INTERVAL_MS);
if (clickFlushTimer.unref) clickFlushTimer.unref();

/**
 * Increment click count via the in-memory buffer (fire-and-forget safe).
 * Clicks are batched and flushed to Redis periodically.
 */
function incrementClickCount(shortCode) {
  // Drop clicks if buffer is at capacity (prevents memory exhaustion during Redis outage)
  if (!clickBuffer.has(shortCode) && clickBuffer.size >= CLICK_BUFFER_MAX_SIZE) return;

  const pending = (clickBuffer.get(shortCode) || 0) + 1;
  clickBuffer.set(shortCode, pending);
  // Flush eagerly for high-traffic codes to keep counts roughly accurate
  if (pending >= CLICK_FLUSH_THRESHOLD) {
    flushClickBuffer().catch(() => {});
  }
}

/**
 * Get current click count for a short code.
 */
async function getClickCount(shortCode) {
  if (!redis) return 0;
  const clicks = await redis.get(`${CLICKS_PREFIX}${shortCode}`);
  return Number(clicks) || 0;
}

// ---------------------------------------------------------------------------
// Warm-up: resolve once, then skip the await on subsequent requests.
// ---------------------------------------------------------------------------
let _warmupDone = false;
let warmupReady = Promise.resolve();
if (redis) {
  warmupReady = redis.ping()
    .then(() => { _warmupDone = true; })
    .catch(err => {
      _warmupDone = true;
      console.warn('Redis warm-up ping failed:', err.message);
    });
} else {
  _warmupDone = true;
}

function ensureReady() {
  if (_warmupDone) return Promise.resolve();
  return warmupReady;
}

module.exports = {
  createLink,
  getRedirectRecord,
  findByShortCode,
  findByOriginalUrl,
  incrementClickCount,
  flushClickBuffer,
  checkRedisConnection,
  l1Delete,
  warmupReady,
  ensureReady,
};

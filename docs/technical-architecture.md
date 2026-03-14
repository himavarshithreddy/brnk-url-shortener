# BRNK Technical Architecture

## 1) Feature list (implementation-aligned)

- URL shortening with optional custom short code
- QR code generation with branded styling
- Click tracking for short links
- Optional TTL-based link expiration
- Redirect behavior selection (`301`, `302`, `308`)
- Security protections (rate limiting, URL safety checks, optional CAPTCHA and Safe Browsing)
- Operational monitoring with killswitch and dashboard data
- Interstitial warning page for low-trust or newly created links
- Idempotent link creation (same URL returns existing short code)

## 2) Techniques used

- Layered middleware pipeline for defense-in-depth on link creation
- Multi-level caching for low-latency redirect lookups
- Lazy loading on frontend for QR dependencies to keep initial bundle lean
- Async/non-blocking analytics updates on redirect path
- Input validation and constrained patterns for custom short codes and route params
- Click batching to reduce Redis write amplification under high traffic
- Short code pre-generation pool to eliminate ID generation latency on the hot path
- Collision retry with NX-guarded atomic writes for safe short code allocation

## 3) Technology stack

### Backend (`/backend`)
- Node.js + Express
- Upstash Redis (REST API) for persistent storage
- `nanoid` for cryptographically random short code generation
- `helmet` for security headers
- `cors` for frontend/backend communication
- `express-rate-limit` + custom in-memory controls for abuse mitigation
- Jest for backend tests

### Frontend (`/frontend`)
- React (Create React App)
- React Router for route handling
- `react-helmet-async` for SEO tags
- `qr-code-styling` (lazy-loaded) for QR generation
- `react-toastify` for notifications

### Deployment
- Vercel with separate backend and frontend builds
- Routing orchestrated by root `vercel.json`

## 4) Architecture and repository structure

- `/backend/server.js` — backend entry point and middleware ordering
- `/backend/routes/linkRoutes.js` — API and redirect routes
- `/backend/controllers/linkController.js` — core business handlers
- `/backend/models/Link.js` — Redis data access + cache logic
- `/backend/middleware/*` — layered security, monitoring, captcha, url safety, rate limit
- `/backend/__tests__/*` — backend tests
- `/frontend/src/App.js` — route table
- `/frontend/src/Main.js` — landing page, shorten/QR UI
- `/frontend/src/Track.js` — click tracking UI
- `/frontend/src/Redirect.js` — redirect resolution with interstitial warning UI

## 5) Backend architecture and technical implementation details

### A) Short code generation

Short codes are generated using the `nanoid` library with a custom alphabet:

- **Alphabet**: 62 characters — `a-z`, `A-Z`, `0-9`
- **Length**: 4 characters → ~14.7 million possible combinations (62⁴)
- **Generator**: `customAlphabet()` from nanoid provides cryptographically random IDs

**Pre-generation pool** for zero-latency allocation:

```
Pool size:     256 codes (pre-generated on startup)
Refill trigger: when pool drops below 192 codes
Refill method:  setImmediate() — async, never blocks request path
Fallback:       direct nanoid generation if pool is empty
```

**Collision handling**:

When creating a link, Redis `SET ... NX` (set-if-not-exists) is used atomically. If the code already exists, the SET returns null and creation is retried:

- Custom codes: single attempt, returns error on collision
- Random codes: up to 5 retry attempts with a fresh code each time

This guarantees no two links share the same short code even under concurrent creation.

### B) Create short URL
`POST /shorten`

Security and validation layers execute before persistence:

1. express-rate-limit fallback
2. killswitch middleware
3. advanced rate limiting by IP/subnet/UA
4. URL safety checks
5. optional Google Safe Browsing check
6. optional CAPTCHA verification
7. `createShortUrl` persists mapping in Redis

**Idempotency**: When no custom code is provided, the system checks a reverse URL index (`u:<originalUrl>` → `shortCode`). If the same URL was previously shortened and the link is still valid, the existing short code is returned without creating a duplicate.

Response includes `shortCode`, `originalUrl`, and optional `expiresAt`.

### C) Redirect
`GET /:shortCode`

Optimized hot path:

1. validate short code format (pre-compiled regex)
2. fetch compact redirect record from L1 cache → Redis
3. reject missing/expired/disabled records
4. send 301/302/308 redirect with cache header strategy
5. buffer click increment in memory (batched flush to Redis)
6. run anomaly detection asynchronously

**Redirect flow in Vercel production**: The `vercel.json` routes `/:shortCode` requests directly to the backend serverless function. The backend responds with an HTTP redirect status (301/302/308) and `Location` header — no frontend involvement on the hot path. The frontend `Redirect.js` page is only used as a fallback when links are accessed via the frontend origin (it fetches `/link-info/:shortCode` for trust scoring and shows an interstitial warning if needed before redirecting through the backend).

### D) Track link
`GET /track/:shortCode`

Returns metadata including original URL, click count, and timestamps.

### E) Health and operations
- `GET /health` for service/Redis health
- `GET /monitoring/dashboard` for live operational counters

## 6) Frontend architecture and technical implementation details

- Home page handles both shortening and QR generation workflows
- QR library is lazy-loaded to keep initial bundle smaller for link-shortening-first users
- Track page can parse either a raw short code or a pasted short URL
- Redirect page resolves short code via `/link-info/:shortCode`, displays interstitial warning for low-trust or newly created links, and performs browser redirection through the backend
- API host can be configured via environment variable in frontend runtime

### Interstitial warning page

When a user visits a short link through the frontend, the Redirect page:

1. Fetches `/link-info/:shortCode` to get trust score and warning metadata
2. If `showWarning` is true (trust score < 50 or link created < 24h ago), displays a warning with the destination URL and reason
3. User must explicitly click "Continue anyway" to proceed, or "Go back to safety" to return home
4. If no warning is needed, redirects automatically

This protects users from open redirect abuse and QR code phishing.

## 7) APIs in architecture context

Core API routes are implemented under backend route/controller layers:

- `GET /health`
- `GET /`
- `POST /shorten`
- `GET /:shortCode`
- `GET /track/:shortCode`
- `GET /link-info/:shortCode`
- `GET /monitoring/dashboard`

All responses include the `X-API-Version` header (currently `1.0`) for client version awareness.

Full request and response contracts are documented in [`api-reference.md`](./api-reference.md).

## 8) Database schema and key structure

### Redis key naming convention

| Key pattern | Value type | Description |
|---|---|---|
| `l:<shortCode>` | JSON object | Link record (compact fields for redirect speed) |
| `clicks:<shortCode>` | Integer | Click counter (separate from link record) |
| `u:<originalUrl>` | String | Reverse URL index → shortCode (for idempotent creation) |

### Link record structure (`l:<shortCode>`)

```json
{
  "u": "https://example.com/long/path",   // original URL
  "t": 1704067200000,                     // expiry epoch (ms), 0 = never expires
  "e": 1,                                 // enabled flag (1 = active, 0 = disabled)
  "p": 0,                                 // protected flag (reserved)
  "r": 308,                               // redirect status code (integer)
  "ca": "2024-01-01T00:00:00.000Z"        // createdAt ISO timestamp
}
```

Field names are intentionally short to minimise Redis payload size for the redirect hot path.

### Click counter (`clicks:<shortCode>`)

Stored as a separate Redis key using `INCRBY`. This avoids read-modify-write on the link record during redirects, eliminating write contention on the main object.

### TTL strategy

Expiration is enforced at two levels:

1. **Redis native TTL** (`EX` option on `SET`): Redis automatically evicts the key after the configured seconds. This guarantees storage cleanup.
2. **Application-level check** (`t` field): The redirect handler checks `record.t > 0 && Date.now() > record.t` and returns HTTP 410 for expired links. This catches edge cases where the L1 cache serves a stale record.

Both mechanisms are set at creation time when `ttl` is provided.

### Reverse URL index (`u:<originalUrl>`)

Maps an original URL to its existing short code. Set with the same TTL as the link record. Used for idempotent creation: if the same URL is submitted without a custom code, the existing short code is returned.

## 9) Caching strategy

### L1: In-process memory cache

An in-process `Map`-based cache provides microsecond lookups for hot links:

| Parameter | Value | Rationale |
|---|---|---|
| Max entries | 50,000 | Bounds memory usage per instance |
| Hit TTL | 30 seconds | Balances freshness vs Redis load |
| Miss TTL | 10 seconds | Prevents repeated Redis lookups for invalid codes |
| Eviction | FIFO batch (64 entries) | Amortises eviction cost under burst traffic |
| LRU refresh | delete + re-insert on access | Moves hot entries to Map tail |
| Cleanup | Every 60 seconds | Proactive sweep of expired entries |

**Negative caching**: When a code is not found in Redis, the L1 cache stores `false` for 10 seconds. This prevents repeated Redis lookups for invalid or nonexistent codes.

**Serverless considerations**: On Vercel, each serverless function instance has its own L1 cache that resets when the instance is recycled. The 30-second TTL is intentionally short so that even ephemeral instances benefit for burst traffic patterns (popular links receiving many hits in quick succession). The L1 cache is a performance optimisation, not a correctness requirement — Redis is always the source of truth.

### L2: Redis (source of truth)

Upstash Redis serves as the durable data store. All writes go to Redis first; L1 is populated eagerly on creation and lazily on reads.

### Redirect path cache flow

```
Request → L1.get(code)
  ├─ HIT (< microseconds)  → return cached record
  └─ MISS → Redis.get("l:<code>")
              ├─ FOUND → populate L1, return record
              └─ NOT FOUND → cache miss in L1 (10s TTL), return 404
```

### Response-level caching

Pre-allocated header objects avoid per-request allocations:

- **301/308 redirects**: `Cache-Control: public, max-age=86400, immutable` — browsers and CDNs cache the redirect for 24 hours
- **302 redirects**: `Cache-Control: no-store` — no caching for temporary redirects

## 10) Click analytics implementation

### Batched click counting

Click increments are buffered in an in-memory `Map` and flushed to Redis periodically to reduce write amplification:

| Parameter | Value |
|---|---|
| Flush interval | Every 5 seconds |
| Eager flush threshold | 50 pending clicks per code |
| Redis operation | `INCRBY` via pipeline (batch all pending codes) |
| Failure handling | Clicks are re-queued on pipeline failure |

This trades sub-second click accuracy for significantly lower Redis write load at scale. Under 1,000 redirects/second to 100 different codes, this reduces Redis writes from 1,000/s to ~20/s.

### Analytics on redirect path

After the HTTP redirect response is sent (fire-and-forget):

1. `incrementClickCount(shortCode)` — buffers +1 in memory
2. `recordRedirect(shortCode)` — updates per-link SlidingCounter for anomaly detection
3. `detectClickAnomaly(shortCode)` — logs warning if click volume exceeds threshold

None of these operations block the redirect response.

## 11) Observability and protection design

### Monitoring dashboard (`GET /monitoring/dashboard`)

Returns real-time operational metrics:

```json
{
  "linksCreatedLastMinute": 5,
  "linksCreatedLastHour": 120,
  "redirectsLastMinute": 450,
  "redirectsLastHour": 12000,
  "topDomains": [{ "domain": "example.com", "count": 50 }],
  "topRedirects": [{ "shortCode": "Ab12", "clicksLast5Min": 200 }],
  "recentFlaggedLinks": [{ "url": "...", "reason": "...", "timestamp": "..." }],
  "killSwitch": { "active": false, "activatedAt": null },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Key metrics tracked:
- **Redirect throughput**: global redirects per minute and per hour via SlidingCounter
- **Link creation rate**: per minute and per hour
- **Per-link click volume**: top 20 links by recent clicks
- **Abuse trends**: recently flagged links with reasons
- **Kill switch status**: active/inactive with activation timestamp

### Kill switch

Monitoring tracks malicious link events over a sliding window. If threshold is crossed, all new `POST /shorten` requests return 503 until cooldown expires.

### URL safety middleware

Blocks dangerous patterns, IP-based URLs, nested shorteners (40+ known domains), and low-trust domains before link creation.

## 12) Rate limiting strategy

Rate limiting operates at multiple layers and dimensions:

### Layer 1: express-rate-limit (fallback)
- 30 requests per 15 minutes per IP for `POST /shorten`
- 100 requests per 15 minutes per IP for general endpoints

### Layer 2: Advanced creation rate limiter
- **Per-IP**: configurable (default 5/min, 50/hour)
- **Per-subnet**: configurable (default 30/min for /24, 200/hour)
- **User-Agent throttling**: suspicious UAs (bots, curl, scrapy, headless browsers) get 50% of normal limits
- **Progressive backoff**: repeated violations trigger escalating blocks (5min → 30min → 1hr → 24hr)

### Layer 3: Kill switch (global emergency brake)
- Activates when malicious link count exceeds threshold in sliding window
- Blocks all `POST /shorten` requests until cooldown expires
- Configurable via environment variables

### General endpoint protection
- `GET /track/:shortCode` and `GET /link-info/:shortCode` use the general rate limiter
- `GET /:shortCode` (redirects) use the general rate limiter

### Configuration

| Environment variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_PER_MIN` | 5 | Per-IP requests per minute |
| `RATE_LIMIT_PER_HOUR` | 50 | Per-IP requests per hour |
| `RATE_LIMIT_SUBNET_PER_MIN` | 30 | Per-subnet requests per minute |
| `RATE_LIMIT_SUBNET_PER_HOUR` | 200 | Per-subnet requests per hour |
| `KILLSWITCH_MALICIOUS_THRESHOLD` | 10 | Flagged links to trigger kill switch |
| `KILLSWITCH_WINDOW_MS` | 300000 | Kill switch sliding window (ms) |
| `KILLSWITCH_COOLDOWN_MS` | 900000 | Kill switch cooldown duration (ms) |

## 13) Known implementation behavior

- Backend root route `GET /` returns JSON service message
- Frontend contains explicit routes for `/`, `/track`, and `/:shortCode`
- Frontend `Redirect.js` shows interstitial warning for low-trust and newly created links
- Frontend unit tests are not currently present
- All API responses include `X-API-Version: 1.0` header

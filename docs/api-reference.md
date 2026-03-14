# BRNK API Reference

Base URL depends on environment:
- local backend: `http://localhost:3001`
- production: same host or dedicated backend host via Vercel routing

All responses include `X-API-Version: 1.0` header.

## 1) Health check

### `GET /health`
Returns backend and Redis status.

**Success response (200):**
```json
{
  "status": "healthy",
  "redis": "connected",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

May return `503` when Redis is unavailable.

---

## 2) Backend root status

### `GET /`
Lightweight backend status message.

**Success response (200):**
```json
{
  "message": "brnk backend is running."
}
```

---

## 3) Create short URL

### `POST /shorten`
Create a shortened URL mapping.

**Request JSON body:**
```json
{
  "originalUrl": "https://example.com/very/long/path",
  "customShortCode": "optional-custom-code",
  "ttl": 86400,
  "redirectType": "308"
}
```

**Fields:**
- `originalUrl` (required string) — must be valid `http` or `https`, max 2048 characters
- `customShortCode` (optional string) — letters, numbers, hyphens; max 20 chars
- `ttl` (optional number) — seconds, min 60, max 31536000 (1 year)
- `redirectType` (optional string) — one of `301`, `302`, `308` (defaults to `308`)

**Success response (200):**
```json
{
  "shortCode": "Ab12",
  "originalUrl": "https://example.com/very/long/path",
  "expiresAt": "2026-01-02T00:00:00.000Z"
}
```

**Idempotency**: When no custom code is provided, submitting the same `originalUrl` returns the existing short code instead of creating a duplicate. This makes the endpoint safe for retries.

**Short code generation**: Random codes are 4 characters from `[a-zA-Z0-9]` (62⁴ ≈ 14.7M combinations), generated using `nanoid` with a cryptographically random source. If a collision occurs, the system automatically retries up to 5 times with fresh codes.

**Common error responses:**
- `400` invalid URL, invalid custom code, TTL out of range, duplicate shortcode, unsafe URL
- `403` CAPTCHA required (when suspicious request triggers CAPTCHA)
- `429` rate limit exceeded
- `503` Redis unavailable or kill switch active
- `500` internal server error

**Security pipeline**: Before creation, the request passes through rate limiting, kill switch check, URL safety scanning, optional Google Safe Browsing, and optional CAPTCHA verification.

---

## 4) Redirect by short code

### `GET /:shortCode`
Resolves and redirects.

**Behavior:**
- returns HTTP redirect status `301`, `302`, or `308`
- sets `Location` header to original URL
- `301`/`308` responses include `Cache-Control: public, max-age=86400, immutable`
- `302` responses include `Cache-Control: no-store`
- click count is incremented asynchronously (batched, not blocking)
- returns errors when link missing/expired/disabled

**Common error responses:**
- `404` link not found or invalid code
- `410` link expired
- `503` service unavailable
- `500` internal server error

---

## 5) Track link metrics

### `GET /track/:shortCode`
Returns click and metadata for a short code. Rate limited (100 req/15min per IP).

**Success response (200):**
```json
{
  "originalUrl": "https://example.com/very/long/path",
  "shortCode": "Ab12",
  "clicks": 17,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": "2026-01-02T00:00:00.000Z"
}
```

**Note**: Click counts may lag by up to 5 seconds due to batched writes.

**Errors:**
- `404` link not found
- `429` rate limit exceeded
- `503` service unavailable
- `500` internal server error

---

## 6) Link info for interstitial-style UX

### `GET /link-info/:shortCode`
Returns destination and trust/warning metadata. Used by the frontend Redirect page to decide whether to show an interstitial warning. Rate limited (100 req/15min per IP).

**Success response (200):**
```json
{
  "originalUrl": "https://example.com",
  "shortCode": "Ab12",
  "trustScore": 82,
  "showWarning": false,
  "warningReason": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**Warning conditions:**
- `showWarning: true` when `trustScore < 50` (reason: `low_trust_domain`)

---

## 7) Monitoring dashboard

### `GET /monitoring/dashboard`
Returns aggregated operational counters.

If `MONITORING_API_KEY` is set, request must include:

`x-api-key: <your key>`

**Success response (200):**
```json
{
  "linksCreatedLastMinute": 5,
  "linksCreatedLastHour": 120,
  "redirectsLastMinute": 450,
  "redirectsLastHour": 12000,
  "topDomains": [{ "domain": "example.com", "count": 50 }],
  "topRedirects": [{ "shortCode": "Ab12", "clicksLast5Min": 200, "totalTracked": 200 }],
  "recentFlaggedLinks": [{ "url": "...", "reason": "...", "timestamp": "..." }],
  "killSwitch": { "active": false, "activatedAt": null },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

**Errors:**
- `401` when API key is configured and missing/invalid

---

## 8) CORS and client integration notes

- Backend allows `GET`, `POST`, and `OPTIONS`
- Allowed origin is `FRONTEND_URL` if configured; otherwise `*`
- Frontend can target backend via `REACT_APP_API_URL`

## 9) Rate limits summary

| Endpoint | Limit | Window |
|---|---|---|
| `POST /shorten` | 30 requests | 15 minutes |
| `POST /shorten` (advanced) | 5/min, 50/hour per IP | Rolling |
| `POST /shorten` (subnet) | 30/min, 200/hour per /24 | Rolling |
| `GET /track/:shortCode` | 100 requests | 15 minutes |
| `GET /link-info/:shortCode` | 100 requests | 15 minutes |
| `GET /:shortCode` | 100 requests | 15 minutes |

Suspicious user agents receive 50% of creation limits. Progressive backoff applies after repeated violations.

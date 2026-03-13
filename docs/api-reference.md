# BRNK API Reference

Base URL depends on environment:
- local backend: `http://localhost:3001`
- production: same host or dedicated backend host via Vercel routing

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
- `originalUrl` (required string) — must be valid `http` or `https`
- `customShortCode` (optional string) — letters, numbers, hyphens; max 20 chars
- `ttl` (optional number) — seconds, min 60, max 31536000
- `redirectType` (optional string) — one of `301`, `302`, `308` (defaults to `308`)

**Success response (200):**
```json
{
  "shortCode": "Ab12",
  "originalUrl": "https://example.com/very/long/path",
  "expiresAt": "2026-01-02T00:00:00.000Z"
}
```

**Common error responses:**
- `400` invalid URL, invalid custom code, TTL out of range, duplicate shortcode
- `429` rate limit exceeded
- `503` Redis unavailable
- `500` internal server error

---

## 4) Redirect by short code

### `GET /:shortCode`
Resolves and redirects.

**Behavior:**
- returns HTTP redirect status `301`, `302`, or `308`
- sets `Location` header to original URL
- returns errors when link missing/expired/disabled

**Common error responses:**
- `404` link not found or invalid code
- `410` link expired
- `503` service unavailable
- `500` internal server error

---

## 5) Track link metrics

### `GET /track/:shortCode`
Returns click and metadata for a short code.

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

**Errors:**
- `404` link not found
- `503` service unavailable
- `500` internal server error

---

## 6) Link info for interstitial-style UX

### `GET /link-info/:shortCode`
Returns destination and trust/warning metadata.

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

---

## 7) Monitoring dashboard

### `GET /monitoring/dashboard`
Returns aggregated operational counters.

If `MONITORING_API_KEY` is set, request must include:

`x-api-key: <your key>`

**Errors:**
- `401` when API key is configured and missing/invalid

---

## 8) CORS and client integration notes

- Backend allows `GET`, `POST`, and `OPTIONS`
- Allowed origin is `FRONTEND_URL` if configured; otherwise `*`
- Frontend can target backend via `REACT_APP_API_URL`

# BRNK URL Shortener

BRNK is a full-stack URL shortening platform with click tracking, expiration controls, and QR-code generation.
It is designed for fast redirects, simple UX, and layered abuse protection.

---

## Table of Contents

- [1) Non-Technical Overview](#1-non-technical-overview)
- [2) Product Features](#2-product-features)
- [3) System Architecture](#3-system-architecture)
- [4) User Flows](#4-user-flows)
- [5) API Documentation](#5-api-documentation)
- [6) Data Model and Storage](#6-data-model-and-storage)
- [7) Security and Abuse-Prevention Controls](#7-security-and-abuse-prevention-controls)
- [8) Configuration and Environment Variables](#8-configuration-and-environment-variables)
- [9) Local Development Setup](#9-local-development-setup)
- [10) Testing and Build](#10-testing-and-build)
- [11) Deployment and Routing (Vercel)](#11-deployment-and-routing-vercel)
- [12) Monitoring and Operations](#12-monitoring-and-operations)
- [13) Troubleshooting](#13-troubleshooting)
- [14) Limitations and Design Notes](#14-limitations-and-design-notes)
- [15) Tech Stack](#15-tech-stack)
- [License](#license)

---

## 1) Non-Technical Overview

### What this project does
BRNK turns long links into short, shareable links.

You can:
- shorten links instantly,
- optionally choose your own custom short code,
- choose link expiration,
- choose redirect behavior,
- generate and download branded QR codes,
- track click counts of shortened links.

### Who it is for
- Content creators sharing links across social platforms
- Teams running campaigns with custom or trackable links
- Anyone who needs cleaner URLs for presentations, print media, or messaging

### Why BRNK exists
Long URLs are hard to read and share. BRNK provides a lightweight, no-signup workflow focused on speed and simplicity.

---

## 2) Product Features

- **URL shortening** with optional custom code
- **QR code mode** for the resulting short URL
- **Link expiration (TTL)**: never, 1 hour, 1 day, 7 days, 30 days (frontend presets)
- **Redirect type selection**: permanent (`308`) or temporary (`302`)
- **Click tracking** (`/track/:shortCode`)
- **Safety checks** before accepting URLs
- **Rate limiting and abuse defenses**
- **Monitoring dashboard endpoint** for runtime metrics

---

## 3) System Architecture

```text
[Browser (React SPA)]
   |  POST /shorten, GET /track/:code, GET /health
   v
[Express API]
   |  create/read/update counters
   v
[Upstash Redis]
```

### Frontend (React)
- SPA routes:
  - `/` → main shorten/QR experience
  - `/track` → link analytics lookup page
  - `/:shortCode` → redirect/interstitial UI that resolves then redirects
- Main files:
  - `/frontend/src/Main.js`
  - `/frontend/src/Track.js`
  - `/frontend/src/Redirect.js`
  - `/frontend/src/App.js`

### Backend (Node.js + Express)
- API and redirect handling live in:
  - `/backend/server.js`
  - `/backend/routes/linkRoutes.js`
  - `/backend/controllers/linkController.js`
- Redis access and in-memory L1 cache logic:
  - `/backend/models/Link.js`
- Security/abuse middleware:
  - `/backend/middleware/*.js`

### Storage
- Primary persistence: **Upstash Redis**
- Additional runtime optimization: in-process L1 cache for redirect records

---

## 4) User Flows

### A) Shorten URL
1. User enters URL on `/`.
2. Frontend normalizes URL (adds `https://` when missing).
3. Frontend submits `POST /shorten` with options (custom code, TTL, redirect type, optional captcha token).
4. Backend validates + runs security middleware + stores in Redis.
5. UI shows shortened link and optional expiration timestamp.

### B) Generate QR
1. User switches mode to QR.
2. The same shorten request is executed.
3. UI renders branded QR for short URL.
4. User can download PNG, copy image, copy URL/code.

### C) Redirect
1. User opens `/abc1`.
2. Redirect route resolves target URL by short code.
3. Backend responds with configured redirect status (`301/302/308`).
4. Click count increment is fired asynchronously.

### D) Track clicks
1. User opens `/track` and enters short code or full shortened URL.
2. Frontend calls `GET /track/:shortCode`.
3. Backend returns original URL, click count, creation time, and expiry.

---

## 5) API Documentation

Base URL:
- Production is deployment-dependent (configured by `REACT_APP_API_URL` or same-origin).
- On Vercel, key backend paths are routed to `/backend/server.js`.

### `GET /`
Backend root status endpoint.

**Response (200):**
```json
{ "message": "brnk backend is running." }
```

---

### `GET /health`
Checks API/Redis health.

**Response (200):**
```json
{
  "status": "healthy",
  "redis": "connected",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

**Response (503):**
```json
{
  "status": "degraded",
  "redis": "disconnected",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

### `POST /shorten`
Creates a short link.

**Request body:**
```json
{
  "originalUrl": "https://example.com/page",
  "customShortCode": "my-link",
  "ttl": 3600,
  "redirectType": "308",
  "captchaToken": "optional-recaptcha-token"
}
```

**Fields:**
- `originalUrl` (required): must be `http://` or `https://`, max length 2048
- `customShortCode` (optional): `[a-zA-Z0-9-]`, max 20 chars
- `ttl` (optional): minimum 60 seconds, max 1 year
- `redirectType` (optional): `301`, `302`, or `308` (defaults to `308`)
- `captchaToken` (optional): used only when CAPTCHA is configured/challenged

**Success response (200):**
```json
{
  "shortCode": "abc1",
  "originalUrl": "https://example.com/page",
  "expiresAt": "2026-01-01T01:00:00.000Z"
}
```

**Common error responses:**
- `400` invalid URL, unsafe URL, duplicate shortcode, invalid TTL/custom code
- `403` CAPTCHA required/failed or security block
- `429` rate limited
- `503` Redis/service unavailable
- `500` server error

---

### `GET /:shortCode`
Resolves and redirects to destination URL.

**Behavior:**
- Returns redirect status (`301`, `302`, or `308`) with `Location` header when valid.
- Returns `404` if link not found/disabled/invalid code.
- Returns `410` if link is expired.
- Returns `503` when Redis is unavailable.

---

### `GET /track/:shortCode`
Returns click and link metadata.

**Success response (200):**
```json
{
  "originalUrl": "https://example.com/page",
  "shortCode": "abc1",
  "clicks": 42,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": "2026-01-02T00:00:00.000Z"
}
```

**Errors:**
- `404` link not found
- `503` Redis unavailable
- `500` server error

---

### `GET /link-info/:shortCode`
Returns link metadata + trust/warning signal used for interstitial decisions.

**Success response (200):**
```json
{
  "originalUrl": "https://example.com/page",
  "shortCode": "abc1",
  "trustScore": 70,
  "showWarning": false,
  "warningReason": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

Possible warning reasons:
- `low_trust_domain`
- `newly_created`

---

### `GET /monitoring/dashboard`
Returns operational/abuse metrics snapshot.

If `MONITORING_API_KEY` is set, include header:
```text
x-api-key: <your-monitoring-api-key>
```

Unauthorized requests return `401`.

---

## 6) Data Model and Storage

### Redis key structure
- Link record: `l:<shortCode>`
- Click counter: `clicks:<shortCode>`

### Link record fields (stored object)
- `u`: original URL
- `t`: expiry timestamp in epoch ms (`0` = never expires)
- `e`: enabled flag (`1` active)
- `p`: reserved/protected flag
- `r`: redirect status as integer
- `ca`: creation timestamp (ISO)

### Caching strategy
- In-process L1 cache stores both hits and negative misses.
- Short TTL for misses and regular TTL for hits improves hot-path latency.
- Redirect path is optimized for low per-request overhead.

---

## 7) Security and Abuse-Prevention Controls

Security in BRNK is layered and mostly applied on link creation.

### 1) Proxy/anonymizer heuristics
- Detects suspicious proxy/Tor-like headers and excessive forwarded hops.
- Attaches security metadata (`clientIp`, `proxied`, etc.) to requests.

### 2) Tiered rate limiting
- Express fallback limiters on routes.
- Advanced per-IP + per-subnet + suspicious-User-Agent throttling.
- Progressive backoff with temporary blocking after repeated abuse.

### 3) URL safety checks
- Blocks IP-based destination URLs.
- Blocks nested shortener URLs.
- Blocks dangerous patterns (phishing/executable indicators).
- Applies trust score threshold (`MIN_TRUST_SCORE`).

### 4) Optional Google Safe Browsing check
- Enabled only if `GOOGLE_SAFE_BROWSING_API_KEY` is configured.
- Fails open for availability if API is unavailable.

### 5) Optional CAPTCHA for suspicious traffic
- Enabled only if `RECAPTCHA_SECRET_KEY` is configured.
- Only suspicious requests are challenged.
- Fails open if reCAPTCHA API is unreachable.

### 6) Abuse stop mechanism
- If flagged malicious links exceed threshold in a time window,
  creation is temporarily disabled (`503`) for cooldown period.

---

## 8) Configuration and Environment Variables

### Backend (`/backend/.env`)
Use `/backend/.env.example` as template.

| Variable | Required | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis auth token |
| `FRONTEND_URL` | No | Allowed frontend origin for CORS |
| `PORT` | No | Backend port (default `3001`) |
| `RATE_LIMIT_PER_MIN` | No | Per-IP per-minute create limit |
| `RATE_LIMIT_PER_HOUR` | No | Per-IP per-hour create limit |
| `RATE_LIMIT_SUBNET_PER_MIN` | No | Per-subnet per-minute create limit |
| `RATE_LIMIT_SUBNET_PER_HOUR` | No | Per-subnet per-hour create limit |
| `GOOGLE_SAFE_BROWSING_API_KEY` | No | Enables Safe Browsing URL checks |
| `MIN_TRUST_SCORE` | No | Minimum domain trust score |
| `RECAPTCHA_SECRET_KEY` | No | Enables CAPTCHA verification |
| `CAPTCHA_SCORE_THRESHOLD` | No | reCAPTCHA v3 score threshold |
| `MONITORING_API_KEY` | No | Protects monitoring endpoint |
| `KILLSWITCH_MALICIOUS_THRESHOLD` | No | Abuse stop threshold |
| `KILLSWITCH_WINDOW_MS` | No | Abuse stop evaluation window |
| `KILLSWITCH_COOLDOWN_MS` | No | Abuse stop cooldown period |

### Frontend (`/frontend/.env`)
Use `/frontend/.env.example` as template.

| Variable | Required | Purpose |
|---|---|---|
| `REACT_APP_API_URL` | No | Backend API base URL (empty => same origin) |
| `REACT_APP_BASE_URL` | No | Public base for generated short links |
| `REACT_APP_RECAPTCHA_SITE_KEY` | No | Enables frontend reCAPTCHA token generation |

---

## 9) Local Development Setup

### Prerequisites
- Node.js (modern LTS recommended)
- npm
- Upstash Redis instance + credentials

### 1) Install dependencies
```bash
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/backend && npm ci
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/frontend && npm ci
```

### 2) Configure environment
- Copy `/backend/.env.example` to `/backend/.env` and fill values.
- Optionally configure `/frontend/.env` from `/frontend/.env.example`.

### 3) Start backend
```bash
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/backend
npm start
```

### 4) Start frontend
```bash
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/frontend
npm start
```

Default local frontend URL is usually `http://localhost:3000`.

---

## 10) Testing and Build

### Backend tests
```bash
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/backend
npm test
```

### Frontend production build
```bash
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/frontend
npm run build
```

### Frontend tests (if/when test files exist)
```bash
cd /home/runner/work/brnk-url-shortener/brnk-url-shortener/frontend
CI=true npm test -- --watchAll=false
```

---

## 11) Deployment and Routing (Vercel)

Vercel config is in `/vercel.json`.

### Build targets
- `backend/server.js` via `@vercel/node`
- `frontend/package.json` via `@vercel/static-build` (dist: `build`)

### Route behavior highlights
- Requests on host `back.brnk.in` are routed to backend catch-all.
- `/health`, `/shorten`, `/track/:shortCode` route to backend.
- Static frontend assets map to `/frontend/build/*`.
- `/track` and `/` serve frontend SPA entry.
- `/<shortCode>` pattern routes to backend redirect handler.

---

## 12) Monitoring and Operations

### Dashboard endpoint
- `GET /monitoring/dashboard`
- Reports:
  - links created (last minute/hour)
  - top domains
  - top redirects/click volume
  - recent flagged links
  - abuse-stop status

### Operational notes
- Redis warmup ping is performed on startup path.
- Redirect hot path minimizes allocations and avoids unnecessary parsing.
- Cleanup intervals prune old in-memory telemetry and limiter state.

---

## 13) Troubleshooting

### `503 Service temporarily unavailable`
Likely Redis connectivity issue:
- verify `UPSTASH_REDIS_REST_URL`
- verify `UPSTASH_REDIS_REST_TOKEN`
- verify network access to Upstash endpoint

### `429 Too many requests`
Creation endpoint limits are active.
- retry later (respect `Retry-After` header)
- tune rate-limit env values for your traffic profile

### URLs blocked as unsafe (`400`)
- destination may match IP/nested-shortener/dangerous-pattern rules
- trust score may be below `MIN_TRUST_SCORE`

### Monitoring endpoint returns `401`
- set `x-api-key` header correctly
- or clear `MONITORING_API_KEY` if public dashboard is acceptable

### CAPTCHA errors (`403`)
- ensure frontend `REACT_APP_RECAPTCHA_SITE_KEY` and backend `RECAPTCHA_SECRET_KEY` both match the same reCAPTCHA project

---

## 14) Limitations and Design Notes

- No user accounts or per-user ownership model.
- Link edits/deletes are not exposed by API today.
- Analytics is basic click counting (not full campaign analytics).
- Some security integrations (Safe Browsing/CAPTCHA) intentionally fail open to preserve availability.
- In-memory monitoring/rate-limiter state resets on process restart (by design).

---

## 15) Tech Stack

### Frontend
- React
- react-router-dom
- react-helmet-async
- qr-code-styling
- react-toastify
- Vercel Analytics

### Backend
- Node.js
- Express
- helmet
- cors
- express-rate-limit
- nanoid
- Upstash Redis (`@upstash/redis`)

### Testing
- Jest (backend)

---

## License

[MIT](/LICENSE)

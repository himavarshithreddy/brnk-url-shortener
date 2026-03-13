# BRNK Technical Architecture

## 1) Feature list (implementation-aligned)

- URL shortening with optional custom short code
- QR code generation with branded styling
- Click tracking for short links
- Optional TTL-based link expiration
- Redirect behavior selection (`301`, `302`, `308`)
- Security protections (rate limiting, URL safety checks, optional CAPTCHA and Safe Browsing)
- Operational monitoring with killswitch and dashboard data

## 2) Techniques used

- Layered middleware pipeline for defense-in-depth on link creation
- Multi-level caching for low-latency redirect lookups
- Lazy loading on frontend for QR dependencies to keep initial bundle lean
- Async/non-blocking analytics updates on redirect path
- Input validation and constrained patterns for custom short codes and route params

## 3) Technology stack

### Backend (`/backend`)
- Node.js + Express
- Upstash Redis (REST API) for persistent storage
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
- `/frontend/src/Redirect.js` — redirect resolution UI flow

## 5) Backend architecture and technical implementation details

### A) Create short URL
`POST /shorten`

Security and validation layers execute before persistence:

1. express-rate-limit fallback
2. killswitch middleware
3. advanced rate limiting by IP/subnet/UA
4. URL safety checks
5. optional Google Safe Browsing check
6. optional CAPTCHA verification
7. `createShortUrl` persists mapping in Redis

Response includes `shortCode`, `originalUrl`, and optional `expiresAt`.

### B) Redirect
`GET /:shortCode`

Optimized hot path:

1. validate short code format
2. fetch compact redirect record from cache/Redis
3. reject missing/expired/disabled records
4. send 301/302/308 redirect with cache header strategy
5. run click increment + anomaly detection asynchronously

### C) Track link
`GET /track/:shortCode`

Returns metadata including original URL, click count, and timestamps.

### D) Health and operations
- `GET /health` for service/Redis health
- `GET /monitoring/dashboard` for live operational counters

## 6) Frontend architecture and technical implementation details

- Home page handles both shortening and QR generation workflows
- QR library is lazy-loaded to keep initial bundle smaller for link-shortening-first users
- Track page can parse either a raw short code or a pasted short URL
- Redirect page resolves short code and performs browser redirection
- API host can be configured via environment variable in frontend runtime

## 7) APIs in architecture context

Core API routes are implemented under backend route/controller layers:

- `GET /health`
- `GET /`
- `POST /shorten`
- `GET /:shortCode`
- `GET /track/:shortCode`
- `GET /link-info/:shortCode`
- `GET /monitoring/dashboard`

Full request and response contracts are documented in [`api-reference.md`](./api-reference.md).

## 8) Database and scheme/schema details

Each short link stores:

- short code
- original URL
- click count
- created timestamp
- optional expiration timestamp
- redirect type
- enabled state

The redirect path uses normalized compact fields internally for speed.

### Redis key scheme

- `shortCode -> link payload` mapping for primary redirect resolution
- Cached compact redirect records for hot path fetches
- Counter/stat keys for click and operational monitoring data

## 9) Caching strategy

The backend uses a multi-level approach:

- in-process L1 cache for extremely hot redirect lookups
- Redis as durable source of truth
- lightweight header object reuse and code pre-generation to reduce allocation overhead

## 10) Observability and protection design

- Monitoring middleware tracks creation, redirect volume, and anomalies
- Killswitch can block new shorten requests during abuse spikes
- URL safety middleware blocks dangerous patterns and suspicious destinations

## 11) Known implementation behavior

- Backend root route `GET /` returns JSON service message
- Frontend contains explicit routes for `/`, `/track`, and `/:shortCode`
- Frontend unit tests are not currently present

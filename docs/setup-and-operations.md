# Setup and Operations Guide

## 1) Prerequisites

- Node.js (LTS recommended)
- npm
- Upstash Redis database and REST credentials

## 2) Environment setup

### Backend `.env`
Copy `/backend/.env.example` to `/backend/.env` and set:

- `UPSTASH_REDIS_REST_URL` (required)
- `UPSTASH_REDIS_REST_TOKEN` (required)
- `FRONTEND_URL` (optional, recommended in production)
- `PORT` (optional, default `3001`)

Optional protection and monitoring values:

- Rate limiting: `RATE_LIMIT_PER_MIN`, `RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_SUBNET_PER_MIN`, `RATE_LIMIT_SUBNET_PER_HOUR`
- URL safety: `GOOGLE_SAFE_BROWSING_API_KEY`, `MIN_TRUST_SCORE`
- CAPTCHA: `RECAPTCHA_SECRET_KEY`, `CAPTCHA_SCORE_THRESHOLD`
- Monitoring: `MONITORING_API_KEY`, `KILLSWITCH_*`

### Frontend `.env`
Copy `/frontend/.env.example` to `/frontend/.env` and set:

- `REACT_APP_API_URL` (optional if same origin)
- `REACT_APP_BASE_URL` (optional)
- `REACT_APP_RECAPTCHA_SITE_KEY` (optional)

## 3) Local development

Open two terminals:

### Terminal 1 — Backend
```bash
cd backend
npm install
npm start
```

### Terminal 2 — Frontend
```bash
cd frontend
npm install
npm start
```

Frontend runs on port 3000 by default, backend on 3001 by default.

## 4) Test and build commands

### Backend
```bash
cd backend
npm test
```

### Frontend
```bash
cd frontend
npm run build
CI=true npm test -- --watchAll=false
```

Note: frontend currently has no test files, so the CRA test command exits with “No tests found”.

## 5) Deployment (Vercel)

Root `vercel.json` defines:

- backend build from `/backend/server.js`
- frontend static build from `/frontend`
- route mappings that forward API/redirect paths to backend

Host-specific and path-based routing are both used to ensure backend endpoints resolve correctly.

## 6) Runtime operations checklist

- Check `/health` to confirm Redis connectivity
- Watch shorten traffic and blocked requests through `/monitoring/dashboard`
- Keep `MONITORING_API_KEY` set in production
- Rotate API keys and secret values periodically

## 7) Incident handling quick runbook

### If shorten requests suddenly fail
1. Check `/health`
2. Validate Redis credentials and availability
3. Check if killswitch activated due to malicious spikes
4. Verify rate limit thresholds are not overly strict

### If tracking reports missing link
1. Validate short code correctness
2. Check whether link expired
3. Confirm record exists in Redis

### If CORS errors occur in browser
1. Confirm `FRONTEND_URL` matches deployed frontend origin exactly
2. Ensure backend deployment has updated environment variables

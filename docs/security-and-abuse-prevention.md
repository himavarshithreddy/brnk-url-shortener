# Security and Abuse Prevention

## 1) Security goals

BRNK prioritizes:

- Safe link creation
- Fast but controlled redirect handling
- Abuse resistance (automation, spam, malicious URLs)
- Operational visibility and emergency controls

## 2) Security middleware layers

The `POST /shorten` flow applies layered defenses:

1. `express-rate-limit` fallback
2. killswitch guard
3. advanced creation rate limiter
4. URL safety inspection
5. optional Google Safe Browsing validation
6. optional CAPTCHA challenge verification

This layered model prevents a single control failure from fully exposing the endpoint.

## 3) URL safety controls

URL safety middleware checks for:

- invalid/malformed URLs
- IP-based destination links
- nested shortener links
- suspicious phishing/malware patterns
- low trust domain characteristics

If Google Safe Browsing API key is configured, additional external verdicting is applied.

## 4) Rate limiting and anti-automation

Rate limits are enforced at multiple dimensions:

- per-IP
- per-subnet
- suspicious User-Agent behavior
- progressive backoff after repeated violations

This reduces scripted abuse while preserving legitimate usage.

## 5) Killswitch behavior

Monitoring tracks malicious link events over a sliding window.
If threshold is crossed, killswitch activates and blocks further shorten requests temporarily.

Key env controls:

- `KILLSWITCH_MALICIOUS_THRESHOLD`
- `KILLSWITCH_WINDOW_MS`
- `KILLSWITCH_COOLDOWN_MS`

## 6) Monitoring endpoint protection

`/monitoring/dashboard` can be protected by setting `MONITORING_API_KEY`.
When set, requests must include `x-api-key` header.

## 7) Frontend and browser-side protections

- Redirect/error pages use constrained flows and validation of short code patterns
- Helmet adds security headers globally in backend
- CORS origin can be locked to known frontend domain

## 8) Production hardening recommendations

1. Always set strict `FRONTEND_URL` (avoid wildcard in production)
2. Always set `MONITORING_API_KEY`
3. Enable reCAPTCHA keys and Safe Browsing key for higher-risk deployments
4. Monitor dashboard trends and alerts daily
5. Keep dependencies patched and run regular `npm audit` reviews
6. Keep redirect/status behavior documented for support and incident response

## 9) Privacy and data notes

BRNK stores short link metadata and click counts required for operation.
Do not store sensitive credentials in URLs because links may be logged by clients or intermediaries.

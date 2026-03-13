# BRNK Non-Technical Guide

## 1) What BRNK is

**BRNK** is a free URL shortener and QR code generator.
It helps users convert long links into short, shareable links and optionally create branded QR codes.

In simple terms: BRNK makes long links easier to share, track, and use in marketing or communication.

## 2) What problems BRNK solves

- Long URLs are hard to read and share
- Printed material (flyers/posters/cards) needs scannable links
- Teams need quick visibility into link usage (click counts)
- Campaign links often need temporary availability (expiration)

## 3) Core user journey

1. User opens the BRNK home page
2. User pastes a long URL
3. User chooses one of two modes:
   - **Shorten URL** (creates a short link)
   - **QR Code** (creates and displays a stylized QR code)
4. Optional settings:
   - custom short code
   - expiration time
   - redirect type
5. User copies and shares the output
6. User can later track usage via the Track page

## 4) Feature explanation (non-technical)

### URL shortening
BRNK generates a short alias for a long destination URL, so links are easier to remember and share.

### Custom short codes
Users can request a readable alias (example: `/sale-2026`) instead of a random one.

### Expiration controls
A link can be permanent or set to expire after a chosen time window.
Useful for temporary offers or event-specific links.

### Click tracking
Users can check how many times a short link has been visited.
This helps gauge campaign engagement.

### QR generation
BRNK can render a styled QR code for the same destination URL, suitable for social posts, print, and packaging.

### Redirect behavior options
Redirect mode can be selected (e.g., permanent vs temporary redirection) depending on SEO and campaign needs.

## 5) Typical business use cases

- Social media profile links
- Event registration links
- Printed ads and flyers (QR scan)
- Affiliate/referral links
- Internal communication links for large organizations

## 6) Operational notes for non-engineering teams

- BRNK is designed to be fast and globally accessible on serverless infrastructure
- Abuse controls are built in (rate limits, suspicious URL checks, optional CAPTCHA)
- Monitoring endpoint exists for operational visibility
- If links are unexpectedly blocked, security policies may have intentionally flagged unsafe URLs

## 7) Limitations to communicate clearly

- Not all URLs are accepted (unsafe or suspicious links are blocked)
- Custom codes must follow formatting rules
- Links may return “expired” once TTL passes
- Track page only works for links that exist in BRNK storage

## 8) Support & troubleshooting checklist (non-technical)

If a user reports "my link doesn’t work":

1. Confirm the short code was copied correctly
2. Check whether link expiration was set
3. Confirm destination URL was valid at creation time
4. Use Track page to verify link exists
5. Escalate to engineering if issue persists with exact short code and timestamp

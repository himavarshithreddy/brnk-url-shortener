/**
 * URL safety scanning and domain trust scoring middleware.
 * Blocks malicious URLs, IP-based URLs, nested shorteners,
 * and suspicious domain patterns before link creation.
 */

const { recordFlaggedLink } = require('./monitoring');

// Known URL shortener domains to block nested shortening
const SHORTENER_DOMAINS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd',
  'buff.ly', 'adf.ly', 'bl.ink', 'lnkd.in', 'db.tt', 'qr.ae',
  'rebrand.ly', 'rb.gy', 'short.io', 'cutt.ly', 'shorturl.at',
  'tiny.cc', 'v.gd', 'vo.la', 'clck.ru', 'trib.al', 'su.pr',
]);

// Suspicious TLDs often used in phishing/malware
const SUSPICIOUS_TLDS = new Set([
  '.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work',
  '.click', '.link', '.buzz', '.surf', '.icu',
]);

// Dangerous URL patterns (phishing, malware indicators)
const DANGEROUS_PATTERNS = [
  /login.*\.php$/i,
  /signin.*\.html$/i,
  /verify[-_]?account/i,
  /secure[-_]?update/i,
  /confirm[-_]?identity/i,
  /account[-_]?verify/i,
  /wallet[-_]?connect/i,
  /password[-_]?reset/i,
  /@/,  // URLs with @ can be used for credential phishing
  /\.(exe|bat|cmd|scr|pif|msi|dll|vbs|js|wsf|ps1)$/i,
];

// Known malware / phishing domain patterns
const MALWARE_DOMAIN_PATTERNS = [
  /^[a-z0-9]{20,}\./i,  // Very long random subdomains
  /\d{3,}\./,            // Multiple consecutive digits in subdomain
];

/**
 * Check if a URL uses an IP address instead of a domain.
 * Blocks http://123.123.123.123/... style URLs.
 */
function isIpBasedUrl(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname;
    // IPv4
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    // IPv6
    if (host.startsWith('[') || /^[0-9a-f:]+$/i.test(host)) return true;
    // Decimal/octal/hex encoded IPs
    if (/^0x[0-9a-f]+$/i.test(host) || /^\d{8,}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if the URL points to a known shortener (nested shortening).
 */
function isNestedShortener(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return SHORTENER_DOMAINS.has(host);
  } catch {
    return false;
  }
}

/**
 * Check URL path/query for dangerous patterns.
 */
function hasDangerousPattern(urlString) {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(urlString));
}

/**
 * Calculate a trust score for the destination domain.
 * Returns a score from 0 (untrusted) to 100 (fully trusted).
 */
function calculateDomainTrustScore(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    let score = 70; // baseline

    // HTTPS bonus
    if (url.protocol === 'https:') score += 10;

    // Suspicious TLD penalty
    const tld = '.' + host.split('.').slice(-1)[0];
    if (SUSPICIOUS_TLDS.has(tld)) score -= 30;

    // Long random subdomain penalty
    const parts = host.split('.');
    if (parts.length > 3) score -= 10;
    if (parts.some(p => p.length > 20)) score -= 20;

    // Malware domain pattern penalty
    if (MALWARE_DOMAIN_PATTERNS.some(p => p.test(host))) score -= 25;

    // Very long URL penalty (often used in phishing)
    if (urlString.length > 500) score -= 10;
    if (urlString.length > 1000) score -= 10;

    // Multiple redirects/query params (suspicious)
    const paramCount = url.searchParams.toString().split('&').length;
    if (paramCount > 10) score -= 10;

    return Math.max(0, Math.min(100, score));
  } catch {
    return 0;
  }
}

/**
 * Express middleware to scan and validate destination URLs before shortening.
 * Rejects URLs that are IP-based, nested shorteners, or match dangerous patterns.
 */
function urlSafetyCheck(req, res, next) {
  const { originalUrl } = req.body;
  if (!originalUrl) return next();

  // Block IP-based URLs
  if (isIpBasedUrl(originalUrl)) {
    recordFlaggedLink(originalUrl, 'ip_based_url');
    return res.status(400).json({
      error: 'IP-based URLs are not allowed. Please use a domain name.',
    });
  }

  // Block nested short links
  if (isNestedShortener(originalUrl)) {
    recordFlaggedLink(originalUrl, 'nested_shortener');
    return res.status(400).json({
      error: 'Shortening URLs from other URL shorteners is not allowed.',
    });
  }

  // Check for dangerous patterns
  if (hasDangerousPattern(originalUrl)) {
    recordFlaggedLink(originalUrl, 'dangerous_pattern');
    return res.status(400).json({
      error: 'This URL has been flagged as potentially unsafe and cannot be shortened.',
    });
  }

  // Calculate trust score and attach to request
  const trustScore = calculateDomainTrustScore(originalUrl);
  req.securityMeta = req.securityMeta || {};
  req.securityMeta.trustScore = trustScore;

  // Reject very low trust score URLs
  const minTrustScore = parseInt(process.env.MIN_TRUST_SCORE, 10) || 20;
  if (trustScore < minTrustScore) {
    recordFlaggedLink(originalUrl, 'low_trust_score');
    return res.status(400).json({
      error: 'This URL has been flagged as potentially unsafe and cannot be shortened.',
    });
  }

  next();
}

/**
 * Optional Google Safe Browsing API check.
 * Only active if GOOGLE_SAFE_BROWSING_API_KEY env var is set.
 * Performs a lookup and rejects flagged URLs.
 */
async function googleSafeBrowsingCheck(req, res, next) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) return next(); // Skip if not configured

  const { originalUrl } = req.body;
  if (!originalUrl) return next();

  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'brnk-url-shortener', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: originalUrl }],
          },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.matches && data.matches.length > 0) {
        return res.status(400).json({
          error: 'This URL has been flagged as unsafe by Google Safe Browsing and cannot be shortened.',
        });
      }
    }
    // If API call fails, allow through (fail open for availability)
  } catch {
    // Fail open — don't block users if the API is unreachable
  }

  next();
}

module.exports = {
  urlSafetyCheck,
  googleSafeBrowsingCheck,
  isIpBasedUrl,
  isNestedShortener,
  hasDangerousPattern,
  calculateDomainTrustScore,
};

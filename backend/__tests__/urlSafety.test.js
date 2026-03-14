const {
  isIpBasedUrl,
  isNestedShortener,
  hasDangerousPattern,
  calculateDomainTrustScore,
  urlSafetyCheck,
} = require('../middleware/urlSafety');

describe('isIpBasedUrl', () => {
  test('detects IPv4-based URLs', () => {
    expect(isIpBasedUrl('http://123.123.123.123/path')).toBe(true);
    expect(isIpBasedUrl('https://192.168.1.1/')).toBe(true);
    expect(isIpBasedUrl('http://10.0.0.1:8080/test')).toBe(true);
  });

  test('allows domain-based URLs', () => {
    expect(isIpBasedUrl('https://example.com')).toBe(false);
    expect(isIpBasedUrl('https://www.google.com/search')).toBe(false);
    expect(isIpBasedUrl('https://subdomain.example.org')).toBe(false);
  });

  test('handles malformed URLs', () => {
    expect(isIpBasedUrl('not-a-url')).toBe(false);
  });
});

describe('isNestedShortener', () => {
  test('detects known URL shorteners', () => {
    expect(isNestedShortener('https://bit.ly/abc123')).toBe(true);
    expect(isNestedShortener('https://tinyurl.com/test')).toBe(true);
    expect(isNestedShortener('https://t.co/xyz')).toBe(true);
    expect(isNestedShortener('https://goo.gl/short')).toBe(true);
    expect(isNestedShortener('http://cutt.ly/test')).toBe(true);
  });

  test('detects newly added URL shorteners', () => {
    expect(isNestedShortener('https://snip.ly/abc')).toBe(true);
    expect(isNestedShortener('https://shorte.st/test')).toBe(true);
    expect(isNestedShortener('https://s.id/xyz')).toBe(true);
    expect(isNestedShortener('https://bc.vc/abc')).toBe(true);
  });

  test('allows non-shortener domains', () => {
    expect(isNestedShortener('https://example.com')).toBe(false);
    expect(isNestedShortener('https://github.com/repo')).toBe(false);
  });

  test('handles www prefix', () => {
    expect(isNestedShortener('https://www.bit.ly/abc')).toBe(true);
  });
});

describe('hasDangerousPattern', () => {
  test('detects phishing patterns', () => {
    expect(hasDangerousPattern('https://evil.com/login.php')).toBe(true);
    expect(hasDangerousPattern('https://evil.com/verify-account')).toBe(true);
    expect(hasDangerousPattern('https://evil.com/account-verify')).toBe(true);
    expect(hasDangerousPattern('https://evil.com/wallet-connect')).toBe(true);
  });

  test('detects executable downloads', () => {
    expect(hasDangerousPattern('https://evil.com/malware.exe')).toBe(true);
    expect(hasDangerousPattern('https://evil.com/script.bat')).toBe(true);
  });

  test('detects @ sign in URL', () => {
    expect(hasDangerousPattern('https://google.com@evil.com/phish')).toBe(true);
  });

  test('allows safe URLs', () => {
    expect(hasDangerousPattern('https://example.com/page')).toBe(false);
    expect(hasDangerousPattern('https://github.com/user/repo')).toBe(false);
  });
});

describe('calculateDomainTrustScore', () => {
  test('gives high score to trusted HTTPS domains', () => {
    const score = calculateDomainTrustScore('https://example.com');
    expect(score).toBeGreaterThanOrEqual(70);
  });

  test('penalizes suspicious TLDs', () => {
    const normalScore = calculateDomainTrustScore('https://example.com');
    const suspiciousScore = calculateDomainTrustScore('https://example.tk');
    expect(suspiciousScore).toBeLessThan(normalScore);
  });

  test('penalizes very long URLs', () => {
    const shortScore = calculateDomainTrustScore('https://example.com/page');
    const longUrl = 'https://example.com/' + 'a'.repeat(600);
    const longScore = calculateDomainTrustScore(longUrl);
    expect(longScore).toBeLessThan(shortScore);
  });

  test('penalizes excessive subdomains', () => {
    const normalScore = calculateDomainTrustScore('https://example.com');
    const deepScore = calculateDomainTrustScore('https://a.b.c.d.example.com');
    expect(deepScore).toBeLessThan(normalScore);
  });

  test('returns 0 for invalid URLs', () => {
    expect(calculateDomainTrustScore('not-a-url')).toBe(0);
  });
});

describe('urlSafetyCheck middleware', () => {
  function createMockReqResNext(body = {}) {
    const req = { body, securityMeta: {} };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    return { req, res, next, wasNextCalled: () => nextCalled };
  }

  test('passes safe URLs', () => {
    const { req, res, next, wasNextCalled } = createMockReqResNext({
      originalUrl: 'https://example.com/page',
    });
    urlSafetyCheck(req, res, next);
    expect(wasNextCalled()).toBe(true);
    expect(req.securityMeta.trustScore).toBeDefined();
  });

  test('rejects IP-based URLs', () => {
    const { req, res, next, wasNextCalled } = createMockReqResNext({
      originalUrl: 'http://123.123.123.123/path',
    });
    urlSafetyCheck(req, res, next);
    expect(wasNextCalled()).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('IP-based');
  });

  test('rejects nested shorteners', () => {
    const { req, res, next, wasNextCalled } = createMockReqResNext({
      originalUrl: 'https://bit.ly/abc123',
    });
    urlSafetyCheck(req, res, next);
    expect(wasNextCalled()).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('shorteners');
  });

  test('rejects dangerous patterns', () => {
    const { req, res, next, wasNextCalled } = createMockReqResNext({
      originalUrl: 'https://evil.com/login.php',
    });
    urlSafetyCheck(req, res, next);
    expect(wasNextCalled()).toBe(false);
    expect(res.statusCode).toBe(400);
  });

  test('passes through when no originalUrl', () => {
    const { req, res, next, wasNextCalled } = createMockReqResNext({});
    urlSafetyCheck(req, res, next);
    expect(wasNextCalled()).toBe(true);
  });
});

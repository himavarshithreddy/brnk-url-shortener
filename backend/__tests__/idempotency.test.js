/**
 * Tests that URL creation never applies global idempotency.
 *
 * Every call to createShortUrl must always generate a new, independent short
 * code — even when the same originalUrl has been shortened before, and even
 * when all parameters are identical.  This ensures that each short link is an
 * independent tracking entity with isolated click analytics and clear ownership.
 *
 * Covers:
 *  1. Same URL submitted twice → two distinct short codes are created
 *  2. Custom short code → no reverse-index check, fails fast on collision
 *  3. URL with TTL → always creates a new link
 *  4. URL with non-default redirectType → always creates a new link
 *  5. 400 when a custom short code already exists
 */

// ---------------------------------------------------------------------------
// Mock the Link model so no real Redis connection is needed.
// ---------------------------------------------------------------------------
jest.mock('../models/Link', () => ({
  createLink: jest.fn(),
  findByShortCode: jest.fn(),
  getRedirectRecord: jest.fn(),
  incrementClickCount: jest.fn(),
  checkRedisConnection: jest.fn(),
  ensureReady: jest.fn().mockResolvedValue(undefined),
  l1Delete: jest.fn(),
  warmupReady: Promise.resolve(),
  flushClickBuffer: jest.fn(),
}));

// Mock monitoring middleware to avoid side-effects
jest.mock('../middleware/monitoring', () => ({
  recordLinkCreation: jest.fn(),
  recordRedirect: jest.fn(),
  detectClickAnomaly: jest.fn().mockReturnValue(false),
  getDashboardData: jest.fn().mockReturnValue({}),
}));

const {
  createLink,
  ensureReady,
} = require('../models/Link');

const { createShortUrl } = require('../controllers/linkController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body = {}) {
  return { body, securityMeta: null, ip: '127.0.0.1' };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  ensureReady.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Every request always creates a new link
// ---------------------------------------------------------------------------
describe('createShortUrl — always creates a new independent link', () => {
  test('creates a new link and returns a short code', async () => {
    const originalUrl = 'https://example.com/page';

    createLink.mockResolvedValue({ shortCode: 'ab12', originalUrl, expiresAt: null });

    const req = makeReq({ originalUrl });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(createLink).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.originalUrl).toBe(originalUrl);
    expect(res.body.shortCode).toBeTruthy();
  });

  test('creates a second independent link for the same URL', async () => {
    const originalUrl = 'https://example.com/page';

    // Two consecutive calls each produce a new link — no caching/dedup
    createLink
      .mockResolvedValueOnce({ shortCode: 'ab12', originalUrl, expiresAt: null })
      .mockResolvedValueOnce({ shortCode: 'cd34', originalUrl, expiresAt: null });

    const req1 = makeReq({ originalUrl });
    const res1 = makeRes();
    await createShortUrl(req1, res1);

    const req2 = makeReq({ originalUrl });
    const res2 = makeRes();
    await createShortUrl(req2, res2);

    // Both calls must have hit createLink — no reverse-index short-circuit
    expect(createLink).toHaveBeenCalledTimes(2);
    expect(res1.body.shortCode).not.toBe(res2.body.shortCode);
  });

  test('creates a new link when TTL is specified', async () => {
    const originalUrl = 'https://example.com/ttl-link';
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    createLink.mockResolvedValue({ shortCode: 'ttlC', originalUrl, expiresAt });

    const req = makeReq({ originalUrl, ttl: 3600 });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(createLink).toHaveBeenCalledWith(expect.any(String), originalUrl, 3600, '308');
    expect(res.statusCode).toBe(200);
    expect(res.body.originalUrl).toBe(originalUrl);
  });

  test('creates a new link when redirectType is non-default (301)', async () => {
    const originalUrl = 'https://example.com/redirect-type';

    createLink.mockResolvedValue({ shortCode: 'rt01', originalUrl, expiresAt: null });

    const req = makeReq({ originalUrl, redirectType: '301' });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(createLink).toHaveBeenCalledWith(expect.any(String), originalUrl, null, '301');
    expect(res.statusCode).toBe(200);
  });

  test('creates a new link when redirectType is non-default (302)', async () => {
    const originalUrl = 'https://example.com/redirect-type-302';

    createLink.mockResolvedValue({ shortCode: 'rt02', originalUrl, expiresAt: null });

    const req = makeReq({ originalUrl, redirectType: '302' });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(createLink).toHaveBeenCalledWith(expect.any(String), originalUrl, null, '302');
    expect(res.statusCode).toBe(200);
  });

  test('uses the custom short code and does not deduplicate', async () => {
    const originalUrl = 'https://example.com/custom';
    const customShortCode = 'my-link';

    createLink.mockResolvedValue({ shortCode: customShortCode, originalUrl, expiresAt: null });

    const req = makeReq({ originalUrl, customShortCode });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(createLink).toHaveBeenCalledWith(customShortCode, originalUrl, null, expect.any(String));
    expect(res.body.shortCode).toBe(customShortCode);
  });

  test('returns 400 when a custom short code already exists', async () => {
    const originalUrl = 'https://example.com/clash';
    const customShortCode = 'taken';

    // createLink returns null → NX condition not met (key already exists)
    createLink.mockResolvedValue(null);

    const req = makeReq({ originalUrl, customShortCode });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'Shortcode already exists' });
  });
});


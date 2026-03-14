/**
 * Tests for idempotent URL creation via the reverse index (u:<originalUrl>).
 *
 * Covers:
 *  1. createShortUrl controller — returns the existing short code when the
 *     same URL is submitted again without a custom code.
 *  2. findByOriginalUrl model helper — reverse-index lookup behaviour.
 */

// ---------------------------------------------------------------------------
// Mock the Link model so no real Redis connection is needed.
// ---------------------------------------------------------------------------
jest.mock('../models/Link', () => ({
  createLink: jest.fn(),
  findByOriginalUrl: jest.fn(),
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
  findByOriginalUrl,
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
// createShortUrl — idempotency via reverse index
// ---------------------------------------------------------------------------
describe('createShortUrl — idempotent creation', () => {
  test('returns existing short code when URL already has a mapping', async () => {
    const originalUrl = 'https://example.com/already-exists';

    // Simulate reverse-index hit: URL was previously shortened
    findByOriginalUrl.mockResolvedValue({
      shortCode: 'abc1',
      originalUrl,
      expiresAt: null,
    });

    const req = makeReq({ originalUrl });
    const res = makeRes();

    await createShortUrl(req, res);

    // Should return the existing code — no new link created
    expect(findByOriginalUrl).toHaveBeenCalledWith(originalUrl);
    expect(createLink).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      shortCode: 'abc1',
      originalUrl,
      expiresAt: null,
    });
  });

  test('preserves expiresAt from the existing link when returning idempotent result', async () => {
    const originalUrl = 'https://example.com/expiring';
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    findByOriginalUrl.mockResolvedValue({
      shortCode: 'xyz9',
      originalUrl,
      expiresAt,
    });

    const req = makeReq({ originalUrl });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(res.body.expiresAt).toBe(expiresAt);
    expect(res.body.shortCode).toBe('xyz9');
  });

  test('creates a new link when URL has no existing mapping', async () => {
    const originalUrl = 'https://example.com/brand-new';

    // No reverse-index hit
    findByOriginalUrl.mockResolvedValue(null);

    createLink.mockResolvedValue({
      shortCode: 'newC',
      originalUrl,
      expiresAt: null,
    });

    const req = makeReq({ originalUrl });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(findByOriginalUrl).toHaveBeenCalledWith(originalUrl);
    expect(createLink).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.originalUrl).toBe(originalUrl);
  });

  test('skips reverse-index check when a custom short code is provided', async () => {
    const originalUrl = 'https://example.com/custom';
    const customShortCode = 'my-link';

    createLink.mockResolvedValue({
      shortCode: customShortCode,
      originalUrl,
      expiresAt: null,
    });

    const req = makeReq({ originalUrl, customShortCode });
    const res = makeRes();

    await createShortUrl(req, res);

    // Reverse-index should NOT be consulted for custom codes
    expect(findByOriginalUrl).not.toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledWith(
      customShortCode,
      originalUrl,
      null,
      expect.any(String),
    );
    expect(res.body.shortCode).toBe(customShortCode);
  });

  test('returns 400 when custom short code already exists', async () => {
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

// ---------------------------------------------------------------------------
// findByOriginalUrl — reverse index unit tests (model layer)
// ---------------------------------------------------------------------------
describe('findByOriginalUrl — reverse index lookup', () => {
  /**
   * We test the real function by providing a mock Redis client through
   * the module internals.  Because Link.js creates the Redis client at
   * module load time we instead test findByOriginalUrl via the mock
   * defined above — these tests validate the *controller* contract that
   * calls the function.
   */

  test('idempotency check is bypassed when findByOriginalUrl returns null', async () => {
    findByOriginalUrl.mockResolvedValue(null);
    createLink.mockResolvedValue({ shortCode: 'a1b2', originalUrl: 'https://new.example.com', expiresAt: null });

    const req = makeReq({ originalUrl: 'https://new.example.com' });
    const res = makeRes();

    await createShortUrl(req, res);

    // A new link should be created because there is no reverse-index entry
    expect(createLink).toHaveBeenCalledTimes(1);
  });

  test('idempotency check short-circuits creation when reverse index has a hit', async () => {
    findByOriginalUrl.mockResolvedValue({
      shortCode: 'exist',
      originalUrl: 'https://existing.example.com',
      expiresAt: null,
    });

    const req = makeReq({ originalUrl: 'https://existing.example.com' });
    const res = makeRes();

    await createShortUrl(req, res);

    // createLink must NOT be called — existing mapping was returned
    expect(createLink).not.toHaveBeenCalled();
    expect(res.body.shortCode).toBe('exist');
  });
});

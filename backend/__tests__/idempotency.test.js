/**
 * Tests for idempotent URL creation via the reverse index (u:<originalUrl>).
 *
 * Idempotency only applies when ALL of the following are true:
 *  - no custom short code
 *  - no TTL (permanent link)
 *  - default redirect type (308)
 *
 * Any request that specifies a TTL or a non-default redirect type must always
 * create a new independent link — returning an existing link with different
 * settings would silently break the caller's expectations.
 *
 * Covers:
 *  1. createShortUrl controller — idempotent path (no ttl, default type)
 *  2. createShortUrl controller — bypass paths (ttl set, non-default type)
 *  3. findByOriginalUrl model helper — reverse-index lookup behaviour
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

  // -------------------------------------------------------------------------
  // Parameter-aware bypass: TTL
  // -------------------------------------------------------------------------
  test('skips reverse-index check and creates a new link when TTL is specified', async () => {
    const originalUrl = 'https://example.com/ttl-link';
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    createLink.mockResolvedValue({
      shortCode: 'ttlC',
      originalUrl,
      expiresAt,
    });

    // Even if a reverse-index entry exists, it must be ignored when TTL is set
    findByOriginalUrl.mockResolvedValue({
      shortCode: 'old1',
      originalUrl,
      expiresAt: null,
    });

    const req = makeReq({ originalUrl, ttl: 3600 });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(findByOriginalUrl).not.toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledWith(
      expect.any(String),
      originalUrl,
      3600,
      '308',
    );
    // A newly generated code is returned, not the stale reverse-index entry
    expect(res.body.shortCode).not.toBe('old1');
    expect(res.body.originalUrl).toBe(originalUrl);
  });

  // -------------------------------------------------------------------------
  // Parameter-aware bypass: non-default redirect type
  // -------------------------------------------------------------------------
  test('skips reverse-index check and creates a new link when redirectType is non-default', async () => {
    const originalUrl = 'https://example.com/redirect-type';

    createLink.mockResolvedValue({
      shortCode: 'rt01',
      originalUrl,
      expiresAt: null,
    });

    findByOriginalUrl.mockResolvedValue({
      shortCode: 'old2',
      originalUrl,
      expiresAt: null,
    });

    const req = makeReq({ originalUrl, redirectType: '301' });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(findByOriginalUrl).not.toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledWith(
      expect.any(String),
      originalUrl,
      null,
      '301',
    );
    // A newly generated code is returned, not the stale reverse-index entry
    expect(res.body.shortCode).not.toBe('old2');
    expect(res.body.originalUrl).toBe(originalUrl);
  });

  test('skips reverse-index check when both TTL and non-default redirectType are set', async () => {
    const originalUrl = 'https://example.com/both-params';

    createLink.mockResolvedValue({
      shortCode: 'bp01',
      originalUrl,
      expiresAt: new Date(Date.now() + 7200 * 1000).toISOString(),
    });

    const req = makeReq({ originalUrl, ttl: 7200, redirectType: '302' });
    const res = makeRes();

    await createShortUrl(req, res);

    expect(findByOriginalUrl).not.toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledWith(
      expect.any(String),
      originalUrl,
      7200,
      '302',
    );
  });

  test('applies idempotency when explicit redirectType=308 (same as default) and no TTL', async () => {
    const originalUrl = 'https://example.com/explicit-308';

    findByOriginalUrl.mockResolvedValue({
      shortCode: 'e308',
      originalUrl,
      expiresAt: null,
    });

    const req = makeReq({ originalUrl, redirectType: '308' });
    const res = makeRes();

    await createShortUrl(req, res);

    // Explicit 308 is indistinguishable from the default — idempotency must apply
    expect(findByOriginalUrl).toHaveBeenCalledWith(originalUrl);
    expect(createLink).not.toHaveBeenCalled();
    expect(res.body.shortCode).toBe('e308');
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

// Tests for maxClicks / self-destruct redirect enforcement and cache-header behaviour.
// The most critical invariant: redirects for limited links (mc > 0) must NEVER be served
// with permanent cache headers – a cached redirect bypasses the click-count check on
// every subsequent request, completely defeating the feature.

const mockGetRedirectRecord = jest.fn();
const mockAtomicIncrClickCount = jest.fn();
const mockIncrementClickCount = jest.fn();
const mockEnsureReady = jest.fn().mockResolvedValue();
const mockRecordRedirect = jest.fn();
const mockDetectClickAnomaly = jest.fn().mockReturnValue(false);
const mockTrackDeviceStat = jest.fn().mockResolvedValue();
const mockTrackGeoStat = jest.fn().mockResolvedValue();
const mockDetectDeviceType = jest.fn().mockReturnValue('desktop');

jest.mock('../models/Link', () => ({
  getRedirectRecord: (...a) => mockGetRedirectRecord(...a),
  atomicIncrClickCount: (...a) => mockAtomicIncrClickCount(...a),
  incrementClickCount: (...a) => mockIncrementClickCount(...a),
  ensureReady: (...a) => mockEnsureReady(...a),
  detectDeviceType: (...a) => mockDetectDeviceType(...a),
  trackDeviceStat: (...a) => mockTrackDeviceStat(...a),
  trackGeoStat: (...a) => mockTrackGeoStat(...a),
  createLink: jest.fn(),
  findByShortCode: jest.fn(),
  getClickCount: jest.fn(),
  checkRedisConnection: jest.fn(),
  flushClickBuffer: jest.fn(),
  l1Delete: jest.fn(),
  warmupReady: Promise.resolve(),
  deleteLink: jest.fn(),
}));

jest.mock('../middleware/monitoring', () => ({
  recordLinkCreation: jest.fn(),
  recordRedirect: (...a) => mockRecordRedirect(...a),
  detectClickAnomaly: (...a) => mockDetectClickAnomaly(...a),
  getDashboardData: jest.fn(),
}));

jest.mock('../middleware/urlSafety', () => ({
  calculateDomainTrustScore: jest.fn().mockReturnValue(80),
}));

const { getOriginalUrl } = require('../controllers/linkController');

function makeReqRes(shortCode, { ua = 'Mozilla/5.0', accept = 'text/html,application/xhtml+xml' } = {}) {
  const headers = {};
  const req = {
    params: { shortCode },
    headers: {
      'user-agent': ua,
      accept,
    },
    securityMeta: {},
    ip: '1.2.3.4',
  };
  const res = {
    _status: null,
    _headers: headers,
    _ended: false,
    _body: null,
    status(code) { this._status = code; return this; },
    set(key, value) {
      if (typeof key === 'object') Object.assign(this._headers, key);
      else this._headers[key] = value;
      return this;
    },
    end() { this._ended = true; },
    json(body) { this._body = body; return this; },
  };
  return { req, res };
}

describe('maxClicks redirect cache-header enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureReady.mockResolvedValue();
    mockDetectClickAnomaly.mockReturnValue(false);
  });

  test('limited link (mc=1, 308) responds with Cache-Control: no-store', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 1,
    });
    mockAtomicIncrClickCount.mockResolvedValue(1); // first click – within limit

    const { req, res } = makeReqRes('abc1');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(308);
    expect(res._headers['Cache-Control']).toBe('no-store');
    expect(res._headers['Location']).toBe('https://example.com');
  });

  test('limited link (mc=10, 301) responds with Cache-Control: no-store', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 301,
      mc: 10,
    });
    mockAtomicIncrClickCount.mockResolvedValue(5); // 5th click – within limit

    const { req, res } = makeReqRes('abc2');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(301);
    expect(res._headers['Cache-Control']).toBe('no-store');
  });

  test('limited link (mc=5, 302) responds with Cache-Control: no-store', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 302,
      mc: 5,
    });
    mockAtomicIncrClickCount.mockResolvedValue(3);

    const { req, res } = makeReqRes('abc3');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(302);
    expect(res._headers['Cache-Control']).toBe('no-store');
  });

  test('limited link (mc=1) returns 410 when click limit is exceeded', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 1,
    });
    mockAtomicIncrClickCount.mockResolvedValue(2); // second click – over limit

    const { req, res } = makeReqRes('abc4');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(410);
    expect(res._body).toMatchObject({ error: expect.stringContaining('maximum number of clicks') });
  });

  test('self-destruct link (mc=1): first click redirects, second click returns 410', async () => {
    const record = { u: 'https://example.com', t: 0, e: 1, r: 308, mc: 1 };
    mockGetRedirectRecord.mockResolvedValue(record);

    // First click
    mockAtomicIncrClickCount.mockResolvedValue(1);
    const { req: req1, res: res1 } = makeReqRes('sd01');
    await getOriginalUrl(req1, res1);
    expect(res1._status).toBe(308);
    expect(res1._headers['Cache-Control']).toBe('no-store');

    // Second click
    mockAtomicIncrClickCount.mockResolvedValue(2);
    const { req: req2, res: res2 } = makeReqRes('sd01');
    await getOriginalUrl(req2, res2);
    expect(res2._status).toBe(410);
  });

  test('unlimited link (mc=0, 308) still uses permanent cache headers', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 0,
    });

    const { req, res } = makeReqRes('unl1');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(308);
    // Should NOT be no-store – permanent links can be cached
    expect(res._headers['Cache-Control']).not.toBe('no-store');
  });

  test('limited link (mc=3): exactly at limit redirects, one over returns 410', async () => {
    const record = { u: 'https://example.com', t: 0, e: 1, r: 302, mc: 3 };
    mockGetRedirectRecord.mockResolvedValue(record);

    // Third click (at limit)
    mockAtomicIncrClickCount.mockResolvedValue(3);
    const { req: reqOk, res: resOk } = makeReqRes('lim3');
    await getOriginalUrl(reqOk, resOk);
    expect(resOk._status).toBe(302);

    // Fourth click (over limit)
    mockAtomicIncrClickCount.mockResolvedValue(4);
    const { req: reqOver, res: resOver } = makeReqRes('lim3');
    await getOriginalUrl(reqOver, resOver);
    expect(resOver._status).toBe(410);
  });
});

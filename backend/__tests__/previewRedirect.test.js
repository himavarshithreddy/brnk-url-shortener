// Tests for preview-enabled redirect behaviour.
// When a link has pv=1 (preview enabled), the redirect handler should return
// a 302 redirect to /preview/:shortCode instead of the destination.
// The ?nopreview=1 query parameter bypasses this so the "Continue" button
// on the preview page can complete the redirect.

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

function makeReqRes(shortCode, { ua = 'Mozilla/5.0', accept = 'text/html,application/xhtml+xml', query = {} } = {}) {
  const headers = {};
  let redirectUrl = null;
  const req = {
    params: { shortCode },
    query,
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
    _redirectUrl: null,
    status(code) { this._status = code; return this; },
    set(key, value) {
      if (typeof key === 'object') Object.assign(this._headers, key);
      else this._headers[key] = value;
      return this;
    },
    end() { this._ended = true; },
    json(body) { this._body = body; return this; },
    send(body) { this._body = body; return this; },
    redirect(status, url) {
      this._status = status;
      this._redirectUrl = url;
    },
  };
  return { req, res };
}

describe('preview-enabled redirect behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureReady.mockResolvedValue();
    mockDetectClickAnomaly.mockReturnValue(false);
  });

  test('preview-enabled link redirects to /preview/:shortCode', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 0,
      pv: 1,
    });

    const { req, res } = makeReqRes('pvAb');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(302);
    expect(res._redirectUrl).toBe('/preview/pvAb');
    expect(res._headers['Cache-Control']).toBe('no-store');
  });

  test('preview-enabled link with ?nopreview=1 skips preview and redirects normally', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 0,
      pv: 1,
    });

    const { req, res } = makeReqRes('pvAb', { query: { nopreview: '1' } });
    await getOriginalUrl(req, res);

    expect(res._status).toBe(308);
    expect(res._headers['Location']).toBe('https://example.com');
    expect(res._ended).toBe(true);
  });

  test('non-preview link redirects normally without preview page', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 302,
      mc: 0,
    });

    const { req, res } = makeReqRes('noPv');
    await getOriginalUrl(req, res);

    expect(res._status).toBe(302);
    expect(res._headers['Location']).toBe('https://example.com');
    expect(res._redirectUrl).toBeNull();
  });

  test('preview-enabled link with maxClicks enforces click limit after nopreview bypass', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 1,
      pv: 1,
    });
    mockAtomicIncrClickCount.mockResolvedValue(2); // over limit

    const { req, res } = makeReqRes('pvMc', { query: { nopreview: '1' } });
    await getOriginalUrl(req, res);

    expect(res._status).toBe(410);
    expect(res._body.error).toMatch(/maximum/i);
  });

  test('bot user-agent still gets OG HTML even when preview is enabled', async () => {
    mockGetRedirectRecord.mockResolvedValue({
      u: 'https://example.com',
      t: 0,
      e: 1,
      r: 308,
      mc: 0,
      pv: 1,
    });

    const { req, res } = makeReqRes('pvBot', { ua: 'Twitterbot/1.0', accept: '*/*' });
    await getOriginalUrl(req, res);

    expect(res._status).toBe(200);
    expect(res._headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res._body).toContain('og:title');
  });
});

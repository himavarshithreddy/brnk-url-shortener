jest.mock('../models/Link', () => ({
  createLink: jest.fn(),
  getRedirectRecord: jest.fn(),
  findByShortCode: jest.fn(),
  incrementClickCount: jest.fn(),
  atomicIncrClickCount: jest.fn(),
  getClickCount: jest.fn(),
  checkRedisConnection: jest.fn(),
  ensureReady: jest.fn().mockResolvedValue(undefined),
  detectDeviceType: jest.fn().mockReturnValue('desktop'),
  trackDeviceStat: jest.fn().mockResolvedValue(undefined),
  trackGeoStat: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/monitoring', () => ({
  recordLinkCreation: jest.fn(),
  recordRedirect: jest.fn(),
  detectClickAnomaly: jest.fn().mockReturnValue(false),
  getDashboardData: jest.fn().mockReturnValue({}),
}));

jest.mock('../middleware/urlSafety', () => ({
  calculateDomainTrustScore: jest.fn(),
}));

const { getRedirectRecord, getClickCount, ensureReady } = require('../models/Link');
const { calculateDomainTrustScore } = require('../middleware/urlSafety');
const { getLinkInfo } = require('../controllers/linkController');

function makeReq(shortCode = 'abcd') {
  return { params: { shortCode } };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('getLinkInfo warning behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureReady.mockResolvedValue(undefined);
    getClickCount.mockResolvedValue(0);
  });

  test('does not warn for newly created links when trust score is safe', async () => {
    getRedirectRecord.mockResolvedValue({
      e: 1,
      u: 'https://example.com',
      ca: new Date().toISOString(),
      t: 0,
      mc: 0,
    });
    calculateDomainTrustScore.mockReturnValue(95);

    const res = makeRes();
    await getLinkInfo(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.showWarning).toBe(false);
    expect(res.body.warningReason).toBeNull();
  });

  test('warns for low-trust domains', async () => {
    getRedirectRecord.mockResolvedValue({
      e: 1,
      u: 'https://suspicious.example',
      ca: new Date().toISOString(),
      t: 0,
      mc: 0,
    });
    calculateDomainTrustScore.mockReturnValue(20);

    const res = makeRes();
    await getLinkInfo(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.showWarning).toBe(true);
    expect(res.body.warningReason).toBe('low_trust_domain');
  });
});

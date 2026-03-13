jest.mock('../controllers/linkController', () => ({
  createShortUrl: jest.fn(),
  getOriginalUrl: jest.fn(),
  trackClicks: jest.fn(),
  healthCheck: jest.fn(),
  monitoringDashboard: jest.fn(),
  getLinkInfo: jest.fn(),
}));

const router = require('../routes/linkRoutes');

function findRouteLayer(pathname, method) {
  return router.stack.find(
    (layer) => layer.route && layer.route.path === pathname && layer.route.methods[method]
  );
}

describe('linkRoutes', () => {
  test('root route returns unauthorized HTML page', () => {
    const rootLayer = findRouteLayer('/', 'get');
    expect(rootLayer).toBeDefined();

    const handler = rootLayer.route.stack[0].handle;
    const req = {};
    const res = {
      statusCode: null,
      contentType: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      type(value) { this.contentType = value; return this; },
      send(value) { this.body = value; return this; },
    };

    handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.contentType).toBe('html');
    expect(res.body).toContain('Unauthorized');
    expect(res.body).toContain('not available for direct access');
  });
});

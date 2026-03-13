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
  test('root route returns non-authorization html page', () => {
    const rootLayer = findRouteLayer('/', 'get');
    expect(rootLayer).toBeDefined();

    const handler = rootLayer.route.stack[0].handle;
    const req = {};
    const res = {
      statusCode: null,
      body: '',
      status(code) { this.statusCode = code; return this; },
      set() { return this; },
      type() { return this; },
      send(value) { this.body = value; return this; },
    };

    handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('<title>Access Restricted | BRNK</title>');
    expect(res.body).toContain('not authorized for direct browsing');
  });
});

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
  test('root route returns backend status response', () => {
    const rootLayer = findRouteLayer('/', 'get');
    expect(rootLayer).toBeDefined();

    const handler = rootLayer.route.stack[0].handle;
    const req = {};
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'brnk backend is running.' });
  });
});

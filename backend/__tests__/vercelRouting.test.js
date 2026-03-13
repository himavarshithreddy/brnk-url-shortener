const fs = require('fs');
const path = require('path');

describe('vercel routing', () => {
  test('routes all back.brnk.in requests to backend server', () => {
    const vercelConfigPath = path.resolve(__dirname, '../../vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    const backDomainRoute = vercelConfig.routes.find((route) => (
      route.src === '/(.*)' &&
      route.dest === '/backend/server.js' &&
      Array.isArray(route.has) &&
      route.has.some(
        (condition) => condition.type === 'host' && condition.value === 'back.brnk.in'
      )
    ));

    expect(backDomainRoute).toBeDefined();
  });
});

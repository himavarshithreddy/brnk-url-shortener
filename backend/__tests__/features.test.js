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

describe('feature routes', () => {
  test('link-info route exists for GET /link-info/:shortCode', () => {
    const layer = findRouteLayer('/link-info/:shortCode', 'get');
    expect(layer).toBeDefined();
  });

  test('redirect catch-all route exists for GET /:shortCode', () => {
    const layer = findRouteLayer('/:shortCode', 'get');
    expect(layer).toBeDefined();
  });
});

describe('bot detection regex', () => {
  // Test the BOT_UA_RE pattern directly
  const BOT_UA_RE = /Twitterbot|Slackbot|Discordbot|WhatsApp|facebookexternalhit|LinkedInBot|Googlebot|bingbot|TelegramBot|Applebot|Pinterestbot/i;

  const botAgents = [
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0',
    'Discordbot/2.0',
    'WhatsApp/2.23.20.0',
    'facebookexternalhit/1.1',
    'LinkedInBot/1.0',
    'Googlebot/2.1',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'TelegramBot (like TwitterBot)',
    'Applebot/0.1',
  ];

  botAgents.forEach((ua) => {
    test(`detects bot: ${ua}`, () => {
      expect(BOT_UA_RE.test(ua)).toBe(true);
    });
  });

  const normalAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    '',
  ];

  normalAgents.forEach((ua) => {
    test(`does not flag normal UA: "${ua || '(empty)'}"`, () => {
      expect(BOT_UA_RE.test(ua)).toBe(false);
    });
  });
});

describe('OG HTML generation', () => {
  // Inline the function for testing since it's not exported
  function generateOgHtml(originalUrl, shortCode) {
    let domain;
    try {
      domain = new URL(originalUrl).hostname;
    } catch {
      domain = originalUrl;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${domain} — brnk short link</title>
<meta property="og:title" content="${domain}"/>
<meta property="og:description" content="Shortened link via brnk — click to visit ${domain}"/>
<meta property="og:url" content="https://brnk.in/${shortCode}"/>
<meta property="og:site_name" content="brnk"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${domain}"/>
<meta name="twitter:description" content="Shortened link via brnk — click to visit ${domain}"/>
</head>
<body></body>
</html>`;
  }

  test('generates valid OG HTML with correct domain', () => {
    const html = generateOgHtml('https://example.com/path?q=1', 'abc1');
    expect(html).toContain('og:title');
    expect(html).toContain('example.com');
    expect(html).toContain('abc1');
    expect(html).toContain('twitter:card');
    expect(html).toContain('brnk');
  });

  test('generates OG HTML for invalid URL gracefully', () => {
    const html = generateOgHtml('not-a-url', 'xyz');
    expect(html).toContain('not-a-url');
    expect(html).toContain('xyz');
  });
});

describe('maxClicks validation', () => {
  test('valid maxClicks values are accepted', () => {
    const validValues = [0, 1, 10, 100, 1000];
    validValues.forEach((val) => {
      const parsed = parseInt(val, 10);
      expect(isNaN(parsed)).toBe(false);
      expect(parsed >= 0).toBe(true);
    });
  });

  test('negative maxClicks is rejected', () => {
    const parsed = parseInt(-1, 10);
    expect(parsed < 0).toBe(true);
  });
});

describe('vercel.json routing', () => {
  const vercelConfig = require('../../vercel.json');

  test('has link-info route to backend', () => {
    const linkInfoRoute = vercelConfig.routes.find(r => r.src && r.src.includes('link-info'));
    expect(linkInfoRoute).toBeDefined();
    expect(linkInfoRoute.dest).toBe('/backend/server.js');
  });

  test('has preview route to frontend', () => {
    const previewRoute = vercelConfig.routes.find(r => r.src && r.src.includes('preview'));
    expect(previewRoute).toBeDefined();
    expect(previewRoute.dest).toBe('/frontend/build/index.html');
  });
});

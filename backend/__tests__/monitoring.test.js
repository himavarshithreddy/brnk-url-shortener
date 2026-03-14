const {
  recordLinkCreation,
  recordRedirect,
  recordFlaggedLink,
  isKillSwitchActive,
  killSwitchMiddleware,
  detectClickAnomaly,
  detectIpSpike,
  getDashboardData,
  _stats,
} = require('../middleware/monitoring');

// Clear state between tests
beforeEach(() => {
  _stats.linksCreatedPerMinute.length = 0;
  _stats.linksCreatedPerHour.length = 0;
  _stats.flaggedLinks.length = 0;
  _stats.topDomains.clear();
  _stats.redirectsPerLink.clear();
  _stats.creationsByIp.clear();
  _stats.killSwitchActive = false;
  _stats.killSwitchActivatedAt = 0;
  _stats.maliciousLinksWindow.length = 0;
  // Reset global redirect throughput counters
  _stats.totalRedirects.slots[0] = 0;
  _stats.totalRedirects.slots[1] = 0;
  _stats.redirectsPerHour.slots[0] = 0;
  _stats.redirectsPerHour.slots[1] = 0;
});

describe('recordLinkCreation', () => {
  test('tracks link creation timestamps', () => {
    recordLinkCreation('abc123', 'https://example.com', '1.2.3.4');
    expect(_stats.linksCreatedPerMinute.length).toBe(1);
    expect(_stats.linksCreatedPerHour.length).toBe(1);
  });

  test('tracks domain statistics', () => {
    recordLinkCreation('abc123', 'https://example.com/page1', '1.2.3.4');
    recordLinkCreation('def456', 'https://example.com/page2', '1.2.3.4');
    recordLinkCreation('ghi789', 'https://other.com', '1.2.3.4');

    expect(_stats.topDomains.get('example.com')).toBe(2);
    expect(_stats.topDomains.get('other.com')).toBe(1);
  });

  test('tracks per-IP creation', () => {
    recordLinkCreation('abc', 'https://example.com', '1.2.3.4');
    recordLinkCreation('def', 'https://example.com', '1.2.3.4');

    expect(_stats.creationsByIp.get('1.2.3.4').length).toBe(2);
  });
});

describe('recordRedirect', () => {
  test('tracks redirect counts per link via SlidingCounter', () => {
    recordRedirect('abc123');
    recordRedirect('abc123');
    recordRedirect('def456');

    // SlidingCounter exposes .count() instead of .length
    expect(_stats.redirectsPerLink.get('abc123').count()).toBe(2);
    expect(_stats.redirectsPerLink.get('def456').count()).toBe(1);
  });
});

describe('recordFlaggedLink', () => {
  test('records flagged link with reason', () => {
    recordFlaggedLink('https://evil.com', 'phishing');
    expect(_stats.flaggedLinks.length).toBe(1);
    expect(_stats.flaggedLinks[0].url).toBe('https://evil.com');
    expect(_stats.flaggedLinks[0].reason).toBe('phishing');
  });
});

describe('kill switch', () => {
  test('activates when malicious link threshold is reached', () => {
    // Default threshold is 10 malicious links in 5 minutes
    for (let i = 0; i < 10; i++) {
      recordFlaggedLink(`https://evil${i}.com`, 'test');
    }

    expect(isKillSwitchActive()).toBe(true);
  });

  test('does not activate below threshold', () => {
    for (let i = 0; i < 5; i++) {
      recordFlaggedLink(`https://evil${i}.com`, 'test');
    }

    expect(isKillSwitchActive()).toBe(false);
  });

  test('killSwitchMiddleware blocks requests when active', () => {
    _stats.killSwitchActive = true;
    _stats.killSwitchActivatedAt = Date.now();

    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };
    let nextCalled = false;

    killSwitchMiddleware({}, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  test('killSwitchMiddleware allows requests when not active', () => {
    const res = {};
    let nextCalled = false;

    killSwitchMiddleware({}, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});

describe('getDashboardData', () => {
  test('returns dashboard data structure', () => {
    recordLinkCreation('abc', 'https://example.com', '1.2.3.4');
    recordRedirect('abc');
    recordFlaggedLink('https://evil.com', 'test');

    const data = getDashboardData();

    expect(data).toHaveProperty('linksCreatedLastMinute');
    expect(data).toHaveProperty('linksCreatedLastHour');
    expect(data).toHaveProperty('redirectsLastMinute');
    expect(data).toHaveProperty('redirectsLastHour');
    expect(data).toHaveProperty('topDomains');
    expect(data).toHaveProperty('topRedirects');
    expect(data).toHaveProperty('recentFlaggedLinks');
    expect(data).toHaveProperty('killSwitch');
    expect(data).toHaveProperty('timestamp');
    expect(data.linksCreatedLastMinute).toBe(1);
    expect(data.topDomains.length).toBeGreaterThan(0);
  });

  test('tracks global redirect throughput', () => {
    recordRedirect('a');
    recordRedirect('b');
    recordRedirect('a');

    const data = getDashboardData();
    expect(data.redirectsLastMinute).toBe(3);
    expect(data.redirectsLastHour).toBe(3);
  });
});

describe('detectIpSpike', () => {
  test('detects spike from single IP', () => {
    for (let i = 0; i < 11; i++) {
      recordLinkCreation(`code${i}`, 'https://example.com', '1.2.3.4');
    }

    expect(detectIpSpike('1.2.3.4')).toBe(true);
  });

  test('does not flag normal activity', () => {
    recordLinkCreation('abc', 'https://example.com', '1.2.3.4');
    expect(detectIpSpike('1.2.3.4')).toBe(false);
  });
});

/**
 * Real-time monitoring, anomaly detection, and abuse kill switch.
 *
 * Performance notes:
 *   - Redirect counters use a simple integer + periodic reset instead of
 *     timestamp arrays.  This eliminates the O(n) filter() on every redirect
 *     which was the biggest CPU cost on the hot path.
 *   - Link-creation and flagged-link tracking still use timestamp arrays
 *     because those paths are far less frequent and need windowed counts
 *     for the kill-switch logic.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const MALICIOUS_LINK_THRESHOLD = parseInt(process.env.KILLSWITCH_MALICIOUS_THRESHOLD, 10) || 10;
const MALICIOUS_WINDOW_MS = parseInt(process.env.KILLSWITCH_WINDOW_MS, 10) || (5 * MINUTE);
const KILLSWITCH_COOLDOWN_MS = parseInt(process.env.KILLSWITCH_COOLDOWN_MS, 10) || (15 * MINUTE);
const ANOMALY_CLICKS_THRESHOLD = parseInt(process.env.ANOMALY_CLICKS_THRESHOLD, 10) || 10000;
const ANOMALY_CLICKS_WINDOW_MS = parseInt(process.env.ANOMALY_CLICKS_WINDOW_MS, 10) || (5 * MINUTE);

// ---------------------------------------------------------------------------
// Sliding-window counter — O(1) increment, O(1) count query.
// Uses two alternating slots that rotate every half-window.
// ---------------------------------------------------------------------------
class SlidingCounter {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.halfWindow = windowMs / 2;
    this.slots = [0, 0];
    this.slotStart = Date.now();
    this.currentSlot = 0;
  }

  _rotate(now) {
    const elapsed = now - this.slotStart;
    if (elapsed >= this.halfWindow) {
      const rotations = Math.floor(elapsed / this.halfWindow);
      if (rotations >= 2) {
        this.slots[0] = 0;
        this.slots[1] = 0;
      } else {
        this.currentSlot = (this.currentSlot + 1) & 1;
        this.slots[this.currentSlot] = 0;
      }
      this.slotStart = now - (elapsed % this.halfWindow);
    }
  }

  increment(now) {
    if (!now) now = Date.now();
    this._rotate(now);
    this.slots[this.currentSlot]++;
  }

  count(now) {
    if (!now) now = Date.now();
    this._rotate(now);
    return this.slots[0] + this.slots[1];
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const stats = {
  linksCreatedPerMinute: [],
  linksCreatedPerHour: [],
  flaggedLinks: [],
  topDomains: new Map(),
  redirectsPerLink: new Map(),      // shortCode -> SlidingCounter
  creationsByIp: new Map(),
  killSwitchActive: false,
  killSwitchActivatedAt: 0,
  maliciousLinksWindow: [],
  // Global redirect throughput counters
  totalRedirects: new SlidingCounter(MINUTE),
  redirectsPerHour: new SlidingCounter(HOUR),
};

const MAX_FLAGGED_LINKS = 1000;
const MAX_REDIRECT_TRACKING = 10_000;

function recordLinkCreation(shortCode, originalUrl, ip) {
  const now = Date.now();

  stats.linksCreatedPerMinute.push(now);
  stats.linksCreatedPerHour.push(now);

  try {
    const domain = new URL(originalUrl).hostname.toLowerCase();
    stats.topDomains.set(domain, (stats.topDomains.get(domain) || 0) + 1);
  } catch { /* ignore */ }

  if (!stats.creationsByIp.has(ip)) {
    stats.creationsByIp.set(ip, []);
  }
  stats.creationsByIp.get(ip).push(now);
}

/**
 * Record a redirect – O(1) via SlidingCounter instead of array push + filter.
 */
function recordRedirect(shortCode) {
  let counter = stats.redirectsPerLink.get(shortCode);
  if (!counter) {
    if (stats.redirectsPerLink.size >= MAX_REDIRECT_TRACKING) {
      const firstKey = stats.redirectsPerLink.keys().next().value;
      stats.redirectsPerLink.delete(firstKey);
    }
    counter = new SlidingCounter(ANOMALY_CLICKS_WINDOW_MS);
    stats.redirectsPerLink.set(shortCode, counter);
  }
  counter.increment();

  // Track global redirect throughput
  stats.totalRedirects.increment();
  stats.redirectsPerHour.increment();
}

function recordFlaggedLink(url, reason) {
  const now = Date.now();
  stats.flaggedLinks.push({ url, reason, timestamp: new Date(now).toISOString() });
  if (stats.flaggedLinks.length > MAX_FLAGGED_LINKS) {
    stats.flaggedLinks.shift();
  }

  stats.maliciousLinksWindow.push(now);
  checkKillSwitch(now);
}

function checkKillSwitch(now) {
  stats.maliciousLinksWindow = stats.maliciousLinksWindow.filter(
    t => now - t < MALICIOUS_WINDOW_MS
  );

  if (stats.maliciousLinksWindow.length >= MALICIOUS_LINK_THRESHOLD && !stats.killSwitchActive) {
    stats.killSwitchActive = true;
    stats.killSwitchActivatedAt = now;
    console.warn(`[KILL SWITCH] Activated at ${new Date(now).toISOString()} — ${stats.maliciousLinksWindow.length} malicious links in window`);
  }
}

function isKillSwitchActive() {
  if (!stats.killSwitchActive) return false;
  const now = Date.now();
  if (now - stats.killSwitchActivatedAt > KILLSWITCH_COOLDOWN_MS) {
    stats.killSwitchActive = false;
    stats.killSwitchActivatedAt = 0;
    console.info(`[KILL SWITCH] Deactivated at ${new Date(now).toISOString()} — cooldown expired`);
    return false;
  }
  return true;
}

/**
 * O(1) anomaly detection using the sliding counter.
 */
function detectClickAnomaly(shortCode) {
  const counter = stats.redirectsPerLink.get(shortCode);
  if (!counter) return false;
  return counter.count() >= ANOMALY_CLICKS_THRESHOLD;
}

function detectIpSpike(ip) {
  const now = Date.now();
  const creations = stats.creationsByIp.get(ip);
  if (!creations) return false;
  const recentCreations = creations.filter(t => now - t < MINUTE);
  return recentCreations.length > 10;
}

function killSwitchMiddleware(req, res, next) {
  if (isKillSwitchActive()) {
    return res.status(503).json({
      error: 'Link creation is temporarily disabled due to detected abuse. Please try again later.',
    });
  }
  next();
}

function getDashboardData() {
  const now = Date.now();

  stats.linksCreatedPerMinute = stats.linksCreatedPerMinute.filter(t => now - t < MINUTE);
  stats.linksCreatedPerHour = stats.linksCreatedPerHour.filter(t => now - t < HOUR);

  const topDomains = Array.from(stats.topDomains.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([domain, count]) => ({ domain, count }));

  const topRedirects = Array.from(stats.redirectsPerLink.entries())
    .map(([shortCode, counter]) => ({
      shortCode,
      clicksLast5Min: counter.count(now),
      totalTracked: counter.count(now),
    }))
    .sort((a, b) => b.clicksLast5Min - a.clicksLast5Min)
    .slice(0, 20);

  const recentFlagged = stats.flaggedLinks.slice(-50).reverse();

  return {
    linksCreatedLastMinute: stats.linksCreatedPerMinute.length,
    linksCreatedLastHour: stats.linksCreatedPerHour.length,
    redirectsLastMinute: stats.totalRedirects.count(now),
    redirectsLastHour: stats.redirectsPerHour.count(now),
    topDomains,
    topRedirects,
    recentFlaggedLinks: recentFlagged,
    killSwitch: {
      active: stats.killSwitchActive,
      activatedAt: stats.killSwitchActivatedAt
        ? new Date(stats.killSwitchActivatedAt).toISOString()
        : null,
    },
    timestamp: new Date(now).toISOString(),
  };
}

function cleanup() {
  const now = Date.now();

  stats.linksCreatedPerMinute = stats.linksCreatedPerMinute.filter(t => now - t < MINUTE);
  stats.linksCreatedPerHour = stats.linksCreatedPerHour.filter(t => now - t < HOUR);

  // Evict counters that have been silent for a full window
  for (const [key, counter] of stats.redirectsPerLink) {
    if (counter.count(now) === 0) {
      stats.redirectsPerLink.delete(key);
    }
  }

  for (const [key, times] of stats.creationsByIp) {
    const recent = times.filter(t => now - t < HOUR);
    if (recent.length === 0) {
      stats.creationsByIp.delete(key);
    } else {
      stats.creationsByIp.set(key, recent);
    }
  }

  if (stats.topDomains.size > 10000) {
    const sorted = Array.from(stats.topDomains.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5000);
    stats.topDomains = new Map(sorted);
  }
}

const cleanupTimer = setInterval(cleanup, 5 * MINUTE);
if (cleanupTimer.unref) cleanupTimer.unref();

function shutdown() {
  clearInterval(cleanupTimer);
}

module.exports = {
  recordLinkCreation,
  recordRedirect,
  recordFlaggedLink,
  isKillSwitchActive,
  killSwitchMiddleware,
  detectClickAnomaly,
  detectIpSpike,
  getDashboardData,
  shutdown,
  _stats: stats,
  SlidingCounter,
};

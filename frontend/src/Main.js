import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import './App.css';
import { Link } from 'react-router-dom';
import logo from './logo.svg';

// Lazy-load QRCodeStyling — the library is ~50 kB gzipped and is only needed
// when the user selects QR mode or receives a result.  Lazy-loading keeps the
// initial bundle small and speeds up first-paint for the common URL-shorten flow.
let _QRCodeStylingModule = null;
let _qrModulePromise = null;
function loadQRCodeStyling() {
  if (_QRCodeStylingModule) return Promise.resolve(_QRCodeStylingModule);
  if (!_qrModulePromise) {
    _qrModulePromise = import('qr-code-styling').then(m => {
      _QRCodeStylingModule = m.default || m;
      return _QRCodeStylingModule;
    });
  }
  return _qrModulePromise;
}

const TICKER = 'brnk — PUTTING YOUR URL ON A DIET — HOLD TIGHT — TRIMMING THE FAT — ALMOST SKINNY — ';

const QR_TICKER = 'brnk — GENERATING YOUR QR CODE — HOLD TIGHT — ENCODING PIXELS — ALMOST READY — ';
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

const QR_THEME = {
  dotsOptions: {
    type: 'rounded',
    color: '#ff6600',
  },
  cornersSquareOptions: { color: '#ff6600', type: 'extra-rounded' },
  cornersDotOptions: { color: '#ff6600', type: 'dot' },
  backgroundOptions: { color: '#00000000' },
};


function BrnkLoader() {
  const scrambleRef = useRef(null);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const el = scrambleRef.current;
    if (!el) return;
    const id = setInterval(() => {
      el.textContent = Array.from({ length: 6 }, () =>
        CHARS[Math.floor(Math.random() * CHARS.length)]
      ).join('');
    }, 55);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setPercent(p => (p + Math.floor(Math.random() * 9) + 1) % 100);
    }, 220);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="brnk-loader" role="status" aria-label="Shortening your URL">
      {/* CRT scanline overlay */}
      <div className="loader-scanlines" aria-hidden="true" />

      <div className="loader-ticker">
        <div className="loader-ticker-inner">
          <span className="loader-ticker-text">{TICKER}</span>
          <span className="loader-ticker-text" aria-hidden="true">{TICKER}</span>
        </div>
      </div>

      {/* Compression progress bar */}
      <div className="loader-progress-track" aria-hidden="true">
        <div className="loader-progress-fill" style={{ width: `${percent}%` }} />
        <span className="loader-progress-label">COMPRESSING {percent}%</span>
      </div>

      <div className="loader-machine-box">
        <div className="loader-url-in">
          <span className="loader-url-text">
            https://your-very-long-url.com/with/a/really/long/path?query=stuff&ref=somewhere
          </span>
        </div>
        <div className="loader-arrow-zone">→→→</div>
        <div className="loader-code-display loader-glitch-border">
          <span className="loader-slash">/</span>
          <span ref={scrambleRef} className="loader-scramble loader-glitch-text">??????</span>
        </div>
      </div>

      {/* Spark / particle effects */}
      <div className="loader-sparks" aria-hidden="true">
        <span className="spark spark-1" />
        <span className="spark spark-2" />
        <span className="spark spark-3" />
        <span className="spark spark-4" />
        <span className="spark spark-5" />
        <span className="spark spark-6" />
        <span className="spark spark-7" />
        <span className="spark spark-8" />
      </div>

      {/* Bouncing status text */}
      <div className="loader-status-bar" aria-hidden="true">
        <span className="loader-status-word w1">CHOMP</span>
        <span className="loader-status-word w2">SNIP</span>
        <span className="loader-status-word w3">CRUNCH</span>
        <span className="loader-status-word w4">TRIM</span>
      </div>

      <div className="loader-bits-container" aria-hidden="true">
        <span className="lbit lbit-1">https://</span>
        <span className="lbit lbit-2">.com</span>
        <span className="lbit lbit-3">/path</span>
        <span className="lbit lbit-4">?q=</span>
        <span className="lbit lbit-5">www.</span>
        <span className="lbit lbit-6">#!</span>
        <span className="lbit lbit-7">&amp;ref</span>
        <span className="lbit lbit-8">.html</span>
        <span className="lbit lbit-9">://</span>
      </div>
    </div>
  );
}

function QRCodeLoader() {
  const [percent, setPercent] = useState(0);
  const [grid, setGrid] = useState([]);

  useEffect(() => {
    const id = setInterval(() => {
      setPercent(p => (p + Math.floor(Math.random() * 9) + 1) % 100);
    }, 220);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setGrid(
        Array.from({ length: 25 }, () => Math.random() > 0.5)
      );
    }, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="brnk-loader" role="status" aria-label="Generating your QR code">
      <div className="loader-scanlines" aria-hidden="true" />

      <div className="loader-ticker">
        <div className="loader-ticker-inner">
          <span className="loader-ticker-text">{QR_TICKER}</span>
          <span className="loader-ticker-text" aria-hidden="true">{QR_TICKER}</span>
        </div>
      </div>

      <div className="loader-progress-track" aria-hidden="true">
        <div className="loader-progress-fill" style={{ width: `${percent}%` }} />
        <span className="loader-progress-label">ENCODING {percent}%</span>
      </div>

      <div className="loader-machine-box">
        <div className="qr-loader-grid" aria-hidden="true">
          {grid.map((filled, i) => (
            <span key={i} className={`qr-loader-cell ${filled ? 'filled' : ''}`} />
          ))}
        </div>
      </div>

      <div className="loader-sparks" aria-hidden="true">
        <span className="spark spark-1" />
        <span className="spark spark-2" />
        <span className="spark spark-3" />
        <span className="spark spark-4" />
        <span className="spark spark-5" />
        <span className="spark spark-6" />
        <span className="spark spark-7" />
        <span className="spark spark-8" />
      </div>

      <div className="loader-status-bar" aria-hidden="true">
        <span className="loader-status-word w1">SCAN</span>
        <span className="loader-status-word w2">ENCODE</span>
        <span className="loader-status-word w3">PIXEL</span>
        <span className="loader-status-word w4">RENDER</span>
      </div>

      <div className="loader-bits-container" aria-hidden="true">
        <span className="lbit lbit-1">▪▪▪</span>
        <span className="lbit lbit-2">▫▪▫</span>
        <span className="lbit lbit-3">▪▫▪</span>
        <span className="lbit lbit-4">▫▫▪</span>
        <span className="lbit lbit-5">▪▪▫</span>
        <span className="lbit lbit-6">▫▪▪</span>
        <span className="lbit lbit-7">▪▫▫</span>
        <span className="lbit lbit-8">▫▫▫</span>
        <span className="lbit lbit-9">▪▫▪</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NeoQRCode — memoized, lazily-loaded QR renderer
//
// Performance improvements over the original:
//   1. QRCodeStyling library is loaded on-demand (lazy import) so the initial
//      bundle stays small for the common shorten-URL flow.
//   2. The QRCodeStyling instance is reused across renders — only `.update()`
//      is called when value/size change, avoiding full re-initialisation.
//   3. The component is wrapped in React.memo to skip re-renders when props
//      are unchanged.
//   4. `onReady` is excluded from the effect deps to prevent infinite loops
//      when the parent passes an inline callback.
// ---------------------------------------------------------------------------
const NeoQRCode = React.memo(function NeoQRCode({ value, size = 220, onReady }) {
  const containerRef = useRef(null);
  const qrInstanceRef = useRef(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const config = {
      width: size,
      height: size,
      type: 'canvas',
      data: value,
      qrOptions: { errorCorrectionLevel: 'H' },
      dotsOptions: QR_THEME.dotsOptions,
      cornersSquareOptions: QR_THEME.cornersSquareOptions,
      cornersDotOptions: QR_THEME.cornersDotOptions,
      backgroundOptions: QR_THEME.backgroundOptions,
    };

    loadQRCodeStyling().then(QRCodeStyling => {
      if (cancelled) return;

      if (!qrInstanceRef.current) {
        qrInstanceRef.current = new QRCodeStyling(config);
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
        qrInstanceRef.current.append(containerRef.current);
      } else {
        qrInstanceRef.current.update(config);
      }

      if (onReadyRef.current) onReadyRef.current(containerRef.current);
    });

    return () => { cancelled = true; };
  }, [value, size]);

  return <div ref={containerRef} className="neo-qr-canvas" />;
});

function Main() {
  const [url, setUrl] = useState('');
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [ttl, setTtl] = useState('');
  const [redirectType, setRedirectType] = useState('308');
  const [maxClicks, setMaxClicks] = useState('');
  const [selfDestruct, setSelfDestruct] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('shorten');
  const qrRef = useRef(null);
  const apiUrl = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
  const BASE_URL = process.env.REACT_APP_BASE_URL || window.location.origin;
  const recaptchaSiteKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';

  // Warm up the backend serverless function on page load so the first
  // URL-shortening request doesn't pay the cold-start penalty.
  useEffect(() => {
    fetch(`${apiUrl}/health`).catch(() => {});
  }, [apiUrl]);

  // Load reCAPTCHA v3 script when site key is configured
  useEffect(() => {
    if (!recaptchaSiteKey) return;
    if (document.querySelector('script[src*="recaptcha/api.js"]')) return;
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`;
    script.async = true;
    document.head.appendChild(script);
  }, [recaptchaSiteKey]);
  const [shortenedUrl, setShortenedUrl] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [resultSelfDestruct, setResultSelfDestruct] = useState(false);
  const [resultPasswordProtected, setResultPasswordProtected] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (event) => {
    setUrl(event.target.value);
  };

  const handleCustomCodeChange = (event) => {
    
    const sanitizedValue = event.target.value.replace(/[^a-zA-Z0-9-]/g, '');
    setCustomCode(sanitizedValue);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
  
    if (!url) {
      setError('Please enter a URL.');
      return;
    }

    if (useCustomCode && !customCode) {
      setError('Please enter a custom shortcode.');
      return;
    }

    // Format URL if needed
    let formattedUrl = url.trim();
    
    // Check if the URL starts with http:// or https://
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }
    
    // Validate URL format
    const isValidUrl = (string) => {
      try {
        new URL(string);
        return true;
      } catch (_) {
        return false;
      }
    };
  
    if (!isValidUrl(formattedUrl)) {
      setError('Please enter a valid URL.');
      return;
    }
  
    try {
      setIsLoading(true);

      // Obtain reCAPTCHA v3 token when site key is configured
      let captchaToken;
      if (recaptchaSiteKey && window.grecaptcha) {
        try {
          captchaToken = await window.grecaptcha.execute(recaptchaSiteKey, { action: 'shorten' });
        } catch (_) {
          // Continue without token if reCAPTCHA fails
        }
      }

      // Call the backend API with the formatted URL and optional custom code
      const response = await fetch(`${apiUrl}/shorten`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          originalUrl: formattedUrl,
          ...(useCustomCode && { customShortCode: customCode }),
          ...(ttl && { ttl: parseInt(ttl, 10) }),
          redirectType,
          // selfDestruct takes precedence over maxClicks (maps to maxClicks=1 on backend)
          ...(selfDestruct
            ? { selfDestruct: true }
            : (maxClicks && { maxClicks: parseInt(maxClicks, 10) })),
          ...(usePassword && password && { password }),
          ...(captchaToken && { captchaToken }),
        }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        const fullShortenedUrl = `${BASE_URL}/${data.shortCode}`;
        setShortenedUrl(fullShortenedUrl);
        setShortCode(data.shortCode);
        setExpiresAt(data.expiresAt || '');
        setResultSelfDestruct(!!data.selfDestruct);
        setResultPasswordProtected(!!data.passwordProtected);
        setError('');
      } else {
        setError(data.error || 'Failed to shorten URL.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shortenedUrl);
  };
  const copyShortCode = () => {
    navigator.clipboard.writeText(shortCode);
  };

  // ---------------------------------------------------------------------------
  // Branded QR canvas — memoized with useCallback to avoid re-creating the
  // closure on every render.  The function itself is cheap (runs only on
  // explicit user action: download/copy), so caching the output isn't needed.
  // ---------------------------------------------------------------------------
  const createBrandedQRCanvas = useCallback((qrCanvas) => {
    const padding = 22;
    const border = 4;
    const shadowOff = 8;
    const outerMargin = 18;

    const qrW = qrCanvas.width;
    const qrH = qrCanvas.height;
    const frameW = border * 2 + padding * 2 + qrW;
    const frameH = border * 2 + padding * 2 + qrH;

    const canvasW = outerMargin + frameW + shadowOff + outerMargin;
    const canvasH = outerMargin + frameH + shadowOff + outerMargin;

    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const fx = outerMargin;
    const fy = outerMargin;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(fx + shadowOff, fy + shadowOff, frameW, frameH);
    ctx.fillRect(fx, fy, frameW, frameH);

    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(fx + border, fy + border, frameW - border * 2, frameH - border * 2);

    ctx.drawImage(qrCanvas, fx + border + padding, fy + border + padding, qrW, qrH);

    const px = 8;
    const py = 4;
    const lb = 2;
    const ls = 2;
    const fontSize = 10;
    const smallFontSize = 8;
    const labelFont = (size) => `800 ${size}px "Syne", sans-serif`;

    const drawLabel = (text, lx, ly, bg, size) => {
      ctx.font = labelFont(size);
      const tw = ctx.measureText(text).width;
      const bw = lb + px + tw + px + lb;
      const bh = lb + py + size + py + lb;

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(lx + ls, ly + ls, bw, bh);
      ctx.fillRect(lx, ly, bw, bh);
      ctx.fillStyle = bg;
      ctx.fillRect(lx + lb, ly + lb, bw - 2 * lb, bh - 2 * lb);

      ctx.fillStyle = '#1a1a1a';
      ctx.font = labelFont(size);
      ctx.textBaseline = 'top';
      ctx.fillText(text, lx + lb + px, ly + lb + py);
      return bw;
    };

    const measureLabel = (text, size) => {
      ctx.font = labelFont(size);
      return lb + px + ctx.measureText(text).width + px + lb;
    };

    drawLabel('brnk', fx - 4, fy - 12, '#ff6600', fontSize);
    drawLabel('SCAN', fx + frameW + 4 - measureLabel('SCAN', fontSize), fy - 12, '#FFFDF7', fontSize);

    const blLabelH = lb + py + smallFontSize + py + lb;
    drawLabel('\u25A0\u25A0\u25A0', fx - 4, fy + frameH + 12 - blLabelH, '#FFFDF7', smallFontSize);

    const brLabelH = lb + py + fontSize + py + lb;
    drawLabel('QR', fx + frameW + 4 - measureLabel('QR', fontSize), fy + frameH + 12 - brLabelH, '#ff6600', fontSize);

    return c;
  }, []);

  const downloadQR = useCallback(() => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const branded = createBrandedQRCanvas(canvas);
    const dataUrl = branded.toDataURL('image/png');
    const a = document.createElement('a');
    a.download = `brnk-qr-${shortCode}.png`;
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [shortCode, createBrandedQRCanvas]);

  const copyQRImage = useCallback(async () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    try {
      const branded = createBrandedQRCanvas(canvas);
      const blob = await new Promise((resolve, reject) => {
        branded.toBlob(b => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png');
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      // Silently fail if clipboard API is unavailable
    }
  }, [createBrandedQRCanvas]);
  return (
    <div className="app-container">
      <Helmet>
        <title>brnk — Free URL Shortener &amp; QR Code Generator | Custom Short Links &amp; Click Tracking</title>
        <meta name="description" content="brnk is a fast, free URL shortener and QR code generator. Create custom short links, generate QR codes, set expiration dates, choose redirect types, and track clicks — all with zero sign-up required." />
        <meta name="keywords" content="URL shortener, link shortener, short URL, custom short link, shorten URL, free URL shortener, click tracking, link analytics, short link generator, URL redirect, tiny URL, branded links, QR code generator, QR code maker, URL to QR code, link QR code" />
        <meta name="author" content="brnk" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="referrer" content="origin-when-cross-origin" />
        <link rel="alternate" hreflang="en" href="https://brnk.in/" />
        <link rel="alternate" hreflang="x-default" href="https://brnk.in/" />
        <link rel="canonical" href="https://brnk.in/" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://brnk.in/" />
        <meta property="og:title" content="brnk — Free URL Shortener & QR Code Generator | Custom Short Links & Click Tracking" />
        <meta property="og:description" content="Shorten any URL in seconds. Create custom short links, generate QR codes, set expiration dates, and track clicks — fast, free, and no sign-up required." />
        <meta property="og:site_name" content="brnk" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:image" content="https://brnk.in/logo512.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="brnk URL shortener and QR code generator logo" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://brnk.in/" />
        <meta name="twitter:title" content="brnk — Free URL Shortener & QR Code Generator | Custom Short Links & Click Tracking" />
        <meta name="twitter:description" content="Shorten any URL in seconds. Create custom short links, generate QR codes, set expiration dates, and track clicks — fast, free, and no sign-up required." />
        <meta name="twitter:image" content="https://brnk.in/logo512.png" />
        <meta name="twitter:image:alt" content="brnk URL shortener and QR code generator logo" />
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://brnk.in/"
              }
            ]
          }
        `}</script>
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "brnk — Free URL Shortener & QR Code Generator",
            "url": "https://brnk.in/",
            "description": "Create custom short links, generate QR codes, set expiration dates, and track clicks for free with brnk.",
            "isPartOf": {
              "@type": "WebSite",
              "name": "brnk",
              "url": "https://brnk.in/"
            }
          }
        `}</script>
      </Helmet>
      <nav aria-label="Site navigation">
        <Link to="/track" className="track-links-btn">
          Track your Link
        </Link>
      </nav>
      <main className="main-layout">
        {/* Left panel — branding + form */}
        <section className="left-panel" aria-label="URL shortener form">
          <header className="app-header">
            <img src={logo} alt="brnk logo" className="app-logo" />
            <h1 className="title">brnk</h1>
          </header>
          <p className="subtitle">URLs on diet.</p>
          <form onSubmit={handleSubmit} className="form" aria-label="Shorten a URL">
            <div className="mode-toggle">
              <div className="mode-buttons">
                <button
                  type="button"
                  className={`mode-btn ${mode === 'shorten' ? 'active' : ''}`}
                  onClick={() => setMode('shorten')}
                  aria-pressed={mode === 'shorten'}
                >
                  Shorten URL
                </button>
                <button
                  type="button"
                  className={`mode-btn ${mode === 'qrcode' ? 'active' : ''}`}
                  onClick={() => setMode('qrcode')}
                  onMouseEnter={loadQRCodeStyling}
                  onFocus={loadQRCodeStyling}
                  aria-pressed={mode === 'qrcode'}
                >
                  QR Code
                </button>
              </div>
            </div>
            <label htmlFor="url-input" className="sr-only">Enter URL to shorten</label>
            <input
              id="url-input"
              type="text"
              className="input"
              value={url}
              onChange={handleInputChange}
              placeholder="Enter URL (e.g., google.com)"
            />

            <fieldset className="shortcode-options">
              <legend className="sr-only">Short code options</legend>
              <div className="option-buttons">
                <button
                  type="button"
                  className={`option-btn ${!useCustomCode ? 'active' : ''}`}
                  onClick={() => setUseCustomCode(false)}
                  aria-pressed={!useCustomCode}
                >
                  Random Code
                </button>
                <button
                  type="button"
                  className={`option-btn ${useCustomCode ? 'active' : ''}`}
                  onClick={() => setUseCustomCode(true)}
                  aria-pressed={useCustomCode}
                >
                  Custom Code
                </button>
              </div>

              {useCustomCode && (
                <div className="custom-code-container">
                  <div className="custom-url-preview">
                    <span className="base-url">{BASE_URL}/</span>
                    <label htmlFor="custom-code-input" className="sr-only">Custom short code</label>
                    <input
                      id="custom-code-input"
                      type="text"
                      className="custom-code-input"
                      value={customCode}
                      onChange={handleCustomCodeChange}
                      placeholder="your-custom-code"
                      maxLength={20}
                    />
                  </div>
                  <p className="custom-code-hint">Use letters, numbers, and hyphens only (max 20 characters)</p>
                </div>
              )}
            </fieldset>

            <div className="selects-row">
              <div className="ttl-options">
                <label className="ttl-label" htmlFor="ttl-select">Expiration</label>
                <select
                  id="ttl-select"
                  className="ttl-select"
                  value={ttl}
                  onChange={(e) => setTtl(e.target.value)}
                >
                  <option value="">Never</option>
                  <option value="3600">1 Hour</option>
                  <option value="86400">1 Day</option>
                  <option value="604800">7 Days</option>
                  <option value="2592000">30 Days</option>
                </select>
              </div>

              <div className="ttl-options">
                <label className="ttl-label" htmlFor="redirect-type-select">Redirect</label>
                <select
                  id="redirect-type-select"
                  className="ttl-select"
                  value={redirectType}
                  onChange={(e) => setRedirectType(e.target.value)}
                >
                  <option value="308">Permanent (308)</option>
                  <option value="302">Track Clicks (302)</option>
                </select>
              </div>

              <div className="ttl-options">
                <label className="ttl-label" htmlFor="max-clicks-select">Max Clicks</label>
                <select
                  id="max-clicks-select"
                  className="ttl-select"
                  value={selfDestruct ? '1' : maxClicks}
                  onChange={(e) => { setSelfDestruct(false); setMaxClicks(e.target.value); }}
                  disabled={selfDestruct}
                >
                  <option value="">Unlimited</option>
                  <option value="1">1 (One-Time)</option>
                  <option value="10">10</option>
                  <option value="100">100</option>
                  <option value="1000">1,000</option>
                </select>
              </div>
            </div>

            {/* Self-Destruct and Password Protection toggles */}
            <div className="extra-options-row">
              <button
                type="button"
                className={`extra-opt-btn${selfDestruct ? ' active' : ''}`}
                onClick={() => setSelfDestruct(v => !v)}
                aria-pressed={selfDestruct}
                title="Link deletes itself after the first click"
              >
                🔥 Self Destruct
              </button>

              <button
                type="button"
                className={`extra-opt-btn${usePassword ? ' active' : ''}`}
                onClick={() => { setUsePassword(v => !v); if (usePassword) setPassword(''); }}
                aria-pressed={usePassword}
                title="Protect this link with a password"
              >
                🔒 Password
              </button>
            </div>

            {usePassword && (
              <div className="password-field-row">
                <label htmlFor="link-password-input" className="ttl-label">Link Password</label>
                <input
                  id="link-password-input"
                  type="password"
                  className="input password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password for this link"
                  maxLength={100}
                  autoComplete="new-password"
                />
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? (mode === 'qrcode' ? 'Generating...' : 'Shortening...') : (mode === 'qrcode' ? 'Generate QR' : 'Shorten')}
            </button>
          </form>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>

        {/* Right panel — result / loader */}
        <section className="right-panel" aria-label="Shortened URL result">
          {isLoading ? (
            mode === 'qrcode' ? <QRCodeLoader /> : <BrnkLoader />
          ) : shortenedUrl ? (
            mode === 'qrcode' ? (
              <div className="qr-result" aria-live="polite">
                <h2 className="qr-result-label">Your QR Code:</h2>
                <div className="qr-code-frame" ref={qrRef}>
                  <span className="qr-corner-label qr-corner-tl">brnk</span>
                  <span className="qr-corner-label qr-corner-tr">SCAN</span>
                  <NeoQRCode value={shortenedUrl} size={220} />
                  <span className="qr-corner-label qr-corner-bl">&#9632;&#9632;&#9632;</span>
                  <span className="qr-corner-label qr-corner-br">QR</span>
                </div>
                <div className="qr-shortened-url">
                  <a href={shortenedUrl} target="_blank" rel="noopener noreferrer">
                    {shortenedUrl}
                  </a>
                  <button onClick={copyToClipboard} className="qr-copy-btn" aria-label="Copy shortened URL to clipboard">Copy</button>
                </div>
                <div className="qr-actions">
                  <button onClick={downloadQR} className="qr-download-btn" aria-label="Download QR code as PNG">
                    Download QR Code
                  </button>
                  <button onClick={copyQRImage} className="qr-copy-btn" aria-label="Copy QR code image to clipboard">Copy Image</button>
                  <button onClick={copyShortCode} className="qr-copy-btn" aria-label="Copy short code to clipboard">Copy Code</button>
                </div>
                {expiresAt && (
                  <p className="expiry-info">Expires: {new Date(expiresAt).toLocaleString()}</p>
                )}
              </div>
            ) : (
              <div className="result" aria-live="polite">
                <h2 className="shortened-text">Shortened URL:</h2>
                {(resultSelfDestruct || resultPasswordProtected) && (
                  <div className="result-badges">
                    {resultSelfDestruct && (
                      <span className="result-badge badge-self-destruct" title="This link can only be clicked once">
                        🔥 Self Destruct
                      </span>
                    )}
                    {resultPasswordProtected && (
                      <span className="result-badge badge-password" title="This link is password protected">
                        🔒 Password Protected
                      </span>
                    )}
                  </div>
                )}
                <div className="shortened-url-container">
                  <a href={shortenedUrl} target="_blank" rel="noopener noreferrer" className="shortened-url">
                    {shortenedUrl}
                  </a>
                  <button onClick={copyToClipboard} className="copy-btn" aria-label="Copy shortened URL to clipboard">Copy</button>
                  <button onClick={copyShortCode} className="copy-btn" aria-label="Copy short code to clipboard">Copy Code</button>
                </div>
                {expiresAt && (
                  <p className="expiry-info">Expires: {new Date(expiresAt).toLocaleString()}</p>
                )}
              </div>
            )
          ) : (
            <div className="empty-state">
              <div className="empty-accent-bar" aria-hidden="true">
                <span className="empty-accent-text">READY ■ WAITING ■ PASTE URL ■ READY ■ WAITING ■ PASTE URL ■&nbsp;</span>
                <span className="empty-accent-text">READY ■ WAITING ■ PASTE URL ■ READY ■ WAITING ■ PASTE URL ■&nbsp;</span>
              </div>
              <div className="empty-body">
                <div className="empty-corner empty-corner-tl" aria-hidden="true"></div>
                <div className="empty-corner empty-corner-br" aria-hidden="true"></div>
                <div className="empty-icon-display">
                  {mode === 'qrcode' ? (
                    <svg className="empty-icon-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="2.5" />
                      <rect x="8" y="8" width="8" height="8" fill="currentColor" />
                      <rect x="28" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="2.5" />
                      <rect x="32" y="8" width="8" height="8" fill="currentColor" />
                      <rect x="4" y="28" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="2.5" />
                      <rect x="8" y="32" width="8" height="8" fill="currentColor" />
                      <rect x="28" y="28" width="4" height="4" fill="currentColor" />
                      <rect x="36" y="28" width="4" height="4" fill="currentColor" />
                      <rect x="28" y="36" width="4" height="4" fill="currentColor" />
                      <rect x="36" y="36" width="8" height="8" fill="currentColor" />
                      <rect x="40" y="28" width="4" height="4" fill="currentColor" />
                      <rect x="28" y="40" width="4" height="4" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg className="empty-icon-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M20 26a10 10 0 0 0 15.08 1.08l6-6a10 10 0 0 0-14.14-14.14l-3.44 3.42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M28 22a10 10 0 0 0-15.08-1.08l-6 6a10 10 0 0 0 14.14 14.14l3.42-3.42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <p className="empty-state-text">{mode === 'qrcode' ? 'Your QR code will appear here' : 'Your shortened URL will appear here'}</p>
                <p className="empty-state-hint">{mode === 'qrcode' ? 'Paste a URL and hit Generate QR.' : 'Paste a long URL and hit Shorten.'}</p>
                <div className="empty-deco-tags" aria-hidden="true">
                  <span className="empty-tag empty-tag-1">URL</span>
                  <span className="empty-tag empty-tag-2">brnk</span>
                  <span className="empty-tag empty-tag-3">{'://'}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <section className="seo-content" aria-label="About brnk URL Shortener">
        <h2 className="seo-content-heading">Why Choose brnk?</h2>
        <div className="seo-features">
          <div className="seo-feature">
            <h3>
              <svg className="seo-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Instant Shortening &amp; QR Codes
            </h3>
            <p>Paste any long URL and get a short, shareable link in seconds — plus generate a scannable QR code instantly. No sign-up or account required.</p>
          </div>
          <div className="seo-feature">
            <h3>
              <svg className="seo-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22l0-6"/><path d="M21 3l-9 9"/><path d="M3 3l9 9"/><path d="M12 12l0 4"/></svg>
              Custom Short Codes
            </h3>
            <p>Create branded short links with your own custom codes using letters, numbers, and hyphens.</p>
          </div>
          <div className="seo-feature">
            <h3>
              <svg className="seo-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 5-6"/></svg>
              Click Tracking
            </h3>
            <p>Monitor link performance with built-in click analytics. See exactly how many times your link was visited.</p>
          </div>
          <div className="seo-feature">
            <h3>
              <svg className="seo-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Link Expiration
            </h3>
            <p>Set your links to expire after 1 hour, 1 day, 7 days, or 30 days — or keep them forever.</p>
          </div>
        </div>

        <h2 className="seo-content-heading">How It Works</h2>
        <ol className="seo-steps">
          <li><strong>Paste your URL</strong> — Enter any long URL into the input field above.</li>
          <li><strong>Customize</strong> — Choose a random or custom short code, set expiration, and pick a redirect type.</li>
          <li><strong>Share</strong> — Copy your shortened link or generate a QR code to share it anywhere.</li>
          <li><strong>Track</strong> — Visit the <Link to="/track">tracking page</Link> to view click analytics for your links.</li>
        </ol>
      </section>

      <footer className="site-footer">
        <div className="footer-content">
          <p className="footer-brand">brnk — Free URL Shortener &amp; QR Code Generator</p>
          <nav className="footer-nav" aria-label="Footer navigation">
            <Link to="/">Shorten a URL</Link>
            <Link to="/track">Track Your Link</Link>
          </nav>
          <p className="footer-description">A fast, free URL shortener and QR code generator with custom short codes, link expiration, and click tracking. No sign-up required.</p>
        </div>
      </footer>
    </div>
  );
}

export default Main;

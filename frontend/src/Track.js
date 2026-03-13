import React, { useState} from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
function TrackingPage() {
  const [searchParams] = useSearchParams();
  const [urlCode, setUrlCode] = useState(searchParams.get('q') || '');
  const [trackingData, setTrackingData] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const BASE_URL = process.env.REACT_APP_BASE_URL || window.location.origin;

  const handleInputChange = (event) => {
    setUrlCode(event.target.value);
  };

  const extractShortCode = (input) => {
    let code = input.trim();
    try {
      const url = new URL(code);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        code = pathSegments[pathSegments.length - 1];
      }
    } catch {
      if (code.includes('/')) {
        const segments = code.split('/').filter(Boolean);
        if (segments.length > 0) {
          code = segments[segments.length - 1];
        }
      }
    }
    return code;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!urlCode) {
      setError('Please enter a valid shortened URL code.');
      return;
    }
    setIsLoading(true);
    setError('');

    const code = extractShortCode(urlCode);

    try {
      const apiUrl = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/track/${code}`);
      const data = await response.json();

      if (response.ok) {
        setTrackingData(data);
        setError('');
      } else {
        setTrackingData(null);
        setError(data.error || 'Failed to track the URL.');
      }
    } catch (err) {
      setTrackingData(null);
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Helmet>
        <title>Track Your Short Link | brnk URL Analytics &amp; Click Stats</title>
        <meta name="description" content="Track clicks and view analytics for your brnk shortened URLs. Enter your short code to see click counts, creation date, and expiration details — completely free." />
        <meta name="keywords" content="link tracking, URL analytics, click tracking, short link stats, URL click counter, link performance, brnk tracking, shortened URL analytics" />
        <meta name="author" content="brnk" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="referrer" content="origin-when-cross-origin" />
        <link rel="alternate" hreflang="en" href="https://brnk.in/track" />
        <link rel="alternate" hreflang="x-default" href="https://brnk.in/track" />
        <link rel="canonical" href="https://brnk.in/track" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://brnk.in/track" />
        <meta property="og:title" content="Track Your Short Link | brnk URL Analytics & Click Stats" />
        <meta property="og:description" content="Track clicks and view analytics for your brnk shortened URLs. Enter your short code to see click counts, creation date, and expiration details." />
        <meta property="og:site_name" content="brnk" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:image" content="https://brnk.in/logo512.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="brnk URL analytics dashboard logo" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://brnk.in/track" />
        <meta name="twitter:title" content="Track Your Short Link | brnk URL Analytics & Click Stats" />
        <meta name="twitter:description" content="Track clicks and view analytics for your brnk shortened URLs. Enter your short code to see click counts, creation date, and expiration details." />
        <meta name="twitter:image" content="https://brnk.in/logo512.png" />
        <meta name="twitter:image:alt" content="brnk URL analytics dashboard logo" />
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
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Track Link",
                "item": "https://brnk.in/track"
              }
            ]
          }
        `}</script>
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "Track Your Short Link | brnk",
            "url": "https://brnk.in/track",
            "description": "Track clicks and view analytics for brnk shortened URLs.",
            "isPartOf": {
              "@type": "WebSite",
              "name": "brnk",
              "url": "https://brnk.in/"
            }
          }
        `}</script>
      </Helmet>
      <nav aria-label="Site navigation">
        <Link to="/" className="track-links-btn">
          ← Shorten a URL
        </Link>
      </nav>
      <main className="form-container">
        <header>
          <h1 className="title">Track Your brnk URL</h1>
          <p className="subtitle">Enter your shortened URL code to view click analytics and link details</p>
        </header>

        <form onSubmit={handleSubmit} className="form" aria-label="Track a shortened URL">
          <label htmlFor="track-code-input" className="sr-only">Shortened URL code</label>
          <input
            id="track-code-input"
            type="text"
            className="input"
            value={urlCode}
            onChange={handleInputChange}
            placeholder="Enter shortened code"
          />

          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Track'}
          </button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}

        {trackingData && (
          <section className="result" aria-label="Tracking results">
            <h2 className="shortened-text">Tracking Information</h2>
            <div className="tracking-info">
              <p><strong>Original URL:</strong> {trackingData.originalUrl}</p>
              <p><strong>Shortened URL:</strong> <a href={`${BASE_URL}/${trackingData.shortCode}`} target="_blank" rel="noopener noreferrer">{`${BASE_URL}/${trackingData.shortCode}`}</a></p>
              <p><strong>Clicks:</strong> {trackingData.clicks}</p>
              {trackingData.createdAt && (
                <p><strong>Created:</strong> {new Date(trackingData.createdAt).toLocaleString()}</p>
              )}
              {trackingData.expiresAt && (
                <p><strong>Expires:</strong> {new Date(trackingData.expiresAt).toLocaleString()}</p>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-content">
          <p className="footer-brand">brnk — Free URL Shortener</p>
          <nav className="footer-nav" aria-label="Footer navigation">
            <Link to="/">Shorten a URL</Link>
            <Link to="/track">Track Your Link</Link>
          </nav>
          <p className="footer-description">A fast, free URL shortener with custom short codes, link expiration, and click tracking. No sign-up required.</p>
        </div>
      </footer>
    </div>
  );
}

export default TrackingPage;

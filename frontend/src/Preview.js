import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import './App.css';
import logo from './logo.svg';

function PreviewPage() {
  const { shortCode } = useParams();
  const [linkInfo, setLinkInfo] = useState(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(null);
  const apiUrl = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');

  useEffect(() => {
    if (!shortCode || !/^[a-zA-Z0-9_-]+$/.test(shortCode)) {
      setError('Invalid short code.');
      return;
    }

    fetch(`${apiUrl}/link-info/${encodeURIComponent(shortCode)}`)
      .then((res) => {
        if (res.status === 410) throw new Error('Link has expired');
        if (!res.ok) throw new Error('Link not found');
        return res.json();
      })
      .then((data) => {
        setLinkInfo(data);
      })
      .catch((err) => {
        setError(err.message || 'Link not found');
      });
  }, [shortCode, apiUrl]);

  // Countdown timer ref – kept so the interval can be cancelled as soon as the link expires.
  const countdownTimerRef = useRef(null);

  // Expiry countdown timer: fetches expiry once, then counts down purely client-side.
  useEffect(() => {
    if (!linkInfo || !linkInfo.expiresAt) return;

    const updateCountdown = () => {
      const remaining = new Date(linkInfo.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown('Expired');
        clearInterval(countdownTimerRef.current);
        return;
      }
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      const seconds = Math.floor((remaining % 60_000) / 1_000);
      setCountdown(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 1000);
    return () => clearInterval(countdownTimerRef.current);
  }, [linkInfo]);

  const handleContinue = useCallback(() => {
    if (linkInfo) {
      window.location.href = `${(process.env.REACT_APP_API_URL || window.location.origin).replace(/\/+$/, '')}/${encodeURIComponent(shortCode)}`;
    }
  }, [linkInfo, shortCode]);

  const getTrustLabel = (score) => {
    if (score >= 80) return { text: 'High Trust', cls: 'trust-high' };
    if (score >= 50) return { text: 'Medium Trust', cls: 'trust-medium' };
    return { text: 'Low Trust', cls: 'trust-low' };
  };

  if (error) {
    return (
      <div className="app-container">
        <Helmet>
          <title>Link Preview | brnk URL Shortener</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <main className="preview-card" role="alert">
          <header className="app-header">
            <img src={logo} alt="brnk logo" className="app-logo" />
            <h1 className="title">brnk</h1>
          </header>
          <p className="error-message">{error}</p>
          <Link to="/" className="preview-back-btn">← Back to Home</Link>
        </main>
      </div>
    );
  }

  if (!linkInfo) {
    return (
      <div className="app-container">
        <Helmet>
          <title>Loading Preview… | brnk URL Shortener</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <main className="preview-card">
          <header className="app-header">
            <img src={logo} alt="brnk logo" className="app-logo" />
            <h1 className="title">brnk</h1>
          </header>
          <p className="preview-loading">Loading link preview…</p>
        </main>
      </div>
    );
  }

  const trust = getTrustLabel(linkInfo.trustScore);

  return (
    <div className="app-container">
      <Helmet>
        <title>Link Preview | brnk URL Shortener</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content={`Preview for brnk short link — destination: ${linkInfo.domain}`} />
      </Helmet>
      <main className="preview-card">
        <header className="app-header">
          <img src={logo} alt="brnk logo" className="app-logo" />
          <h1 className="title">brnk</h1>
        </header>

        <p className="preview-heading">You are about to visit</p>

        <div className="preview-domain-box">
          <span className="preview-domain">{linkInfo.domain}</span>
        </div>

        <div className="preview-url-box">
          <span className="preview-url">{linkInfo.originalUrl}</span>
        </div>

        <div className="preview-meta">
          {linkInfo.createdAt && (
            <div className="preview-meta-item">
              <span className="preview-meta-label">Created</span>
              <span className="preview-meta-value">
                {new Date(linkInfo.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
          <div className="preview-meta-item">
            <span className="preview-meta-label">Clicks</span>
            <span className="preview-meta-value">{linkInfo.clickCount}</span>
          </div>
          <div className="preview-meta-item">
            <span className="preview-meta-label">Safety</span>
            <span className={`preview-meta-value preview-trust ${trust.cls}`}>
              {trust.text} ({linkInfo.trustScore}/100)
            </span>
          </div>
          {linkInfo.maxClicks > 0 && (
            <div className="preview-meta-item">
              <span className="preview-meta-label">Max Clicks</span>
              <span className="preview-meta-value">{linkInfo.maxClicks}</span>
            </div>
          )}
        </div>

        {countdown && (
          <div className="preview-expiry">
            <span className="preview-expiry-label">Expires in</span>
            <span className="preview-expiry-timer">{countdown}</span>
          </div>
        )}

        {linkInfo.showWarning && (
          <div className="preview-warning" role="alert">
            ⚠️ {linkInfo.warningReason === 'low_trust_domain'
              ? 'This destination has a low trust score. Proceed with caution.'
              : 'This link was recently created. Proceed with caution.'}
          </div>
        )}

        <button className="preview-continue-btn" onClick={handleContinue}>
          Continue →
        </button>

        <Link to="/" className="preview-back-btn">← Back to Home</Link>
      </main>
    </div>
  );
}

export default PreviewPage;

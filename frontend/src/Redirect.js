import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import './App.css';
import logo from './logo.svg';

function RedirectPage() {
  const { shortCode } = useParams();
  const [error, setError] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [showWarning, setShowWarning] = useState(false);
  const [warningReason, setWarningReason] = useState(null);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const apiUrl = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/+$/, '');

  const doRedirect = useCallback(() => {
    window.location.replace(`${apiUrl}/${encodeURIComponent(shortCode)}`);
  }, [apiUrl, shortCode]);

  useEffect(() => {
    if (!shortCode || !/^[a-zA-Z0-9_-]+$/.test(shortCode)) {
      setError('Invalid short code.');
      return;
    }

    // Use link-info endpoint to check trust score and get warning info
    fetch(`${apiUrl}/link-info/${encodeURIComponent(shortCode)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Link not found');
        return res.json();
      })
      .then((data) => {
        setDestinationUrl(data.originalUrl);
        if (data.showWarning) {
          setShowWarning(true);
          setWarningReason(data.warningReason);
        }
      })
      .catch(() => {
        setError('Link not found');
      });
  }, [shortCode, apiUrl]);

  useEffect(() => {
    if (destinationUrl && !showWarning) {
      doRedirect();
    }
    if (destinationUrl && showWarning && userConfirmed) {
      doRedirect();
    }
  }, [destinationUrl, showWarning, userConfirmed, doRedirect]);

  // Countdown timer — purely cosmetic, does not affect the redirect
  useEffect(() => {
    if (!destinationUrl || showWarning) return;
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [destinationUrl, showWarning, countdown]);

  if (error) {
    return (
      <div className="app-container">
        <Helmet>
          <title>Link Not Found | brnk URL Shortener</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <main className="redirect-card" role="alert">
          <header className="app-header">
            <img src={logo} alt="brnk logo" className="app-logo" />
            <h1 className="title">brnk</h1>
          </header>
          <p className="error-message">{error}</p>
        </main>
      </div>
    );
  }

  if (showWarning && !userConfirmed) {
    return (
      <div className="app-container">
        <Helmet>
          <title>Warning | brnk URL Shortener</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <main className="redirect-card" role="alert">
          <header className="app-header">
            <img src={logo} alt="brnk logo" className="app-logo" />
            <h1 className="title">brnk</h1>
          </header>
          <p className="warning-label" style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            ⚠️ Warning
          </p>
          <p className="warning-message" style={{ marginBottom: '1rem' }}>
            {warningReason === 'low_trust_domain'
              ? 'This link points to a domain with a low trust score. It may be unsafe.'
              : 'This is a newly created link. Exercise caution before proceeding.'}
          </p>
          <div className="redirect-url-box">
            <span className="redirect-url">{destinationUrl}</span>
          </div>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={() => setUserConfirmed(true)}
              style={{
                padding: '0.6rem 1.5rem',
                background: '#e74c3c',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Continue anyway
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                padding: '0.6rem 1.5rem',
                background: '#2ecc71',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Go back to safety
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Helmet>
        <title>Redirecting… | brnk URL Shortener</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="You are being redirected to your destination via brnk URL Shortener." />
      </Helmet>
      <main className="redirect-card">
        <header className="app-header">
          <img src={logo} alt="brnk logo" className="app-logo" />
          <h1 className="title">brnk</h1>
        </header>
        <p className="redirect-label">Redirecting you to</p>
        <div className="redirect-url-box">
          <span className="redirect-url">{destinationUrl || '...'}</span>
        </div>
        <div className="redirect-timer" aria-live="polite" aria-atomic="true">{countdown}</div>
        <p className="redirect-hint">You will be redirected automatically</p>
      </main>
    </div>
  );
}

export default RedirectPage;

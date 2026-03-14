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
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
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
        if (data.passwordProtected) {
          setPasswordRequired(true);
          return;
        }
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

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setPasswordError('Please enter the password.');
      return;
    }
    setIsVerifying(true);
    setPasswordError('');
    try {
      const res = await fetch(`${apiUrl}/verify-password/${encodeURIComponent(shortCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        window.location.replace(data.originalUrl);
      } else if (res.status === 410) {
        setError(data.error || 'Link has expired or reached its click limit.');
        setPasswordRequired(false);
      } else {
        setPasswordError(data.error || 'Incorrect password. Please try again.');
      }
    } catch {
      setPasswordError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

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

  if (passwordRequired) {
    return (
      <div className="app-container">
        <Helmet>
          <title>Password Required | brnk URL Shortener</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <main className="redirect-card">
          <header className="app-header">
            <img src={logo} alt="brnk logo" className="app-logo" />
            <h1 className="title">brnk</h1>
          </header>
          <p className="redirect-label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <svg style={{ width: '18px', height: '18px', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            This link is password protected
          </p>
          <form onSubmit={handlePasswordSubmit} style={{ width: '100%', marginTop: '1rem' }}>
            <label htmlFor="link-password" className="sr-only">Link password</label>
            <input
              id="link-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              autoComplete="current-password"
              style={{ marginBottom: '0.75rem' }}
            />
            {passwordError && (
              <p className="error-message" role="alert" style={{ marginBottom: '0.75rem' }}>{passwordError}</p>
            )}
            <button type="submit" className="submit-btn" disabled={isVerifying}>
              {isVerifying ? 'Verifying…' : 'Unlock →'}
            </button>
          </form>
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
          <p className="warning-label" style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
            <svg style={{ width: '20px', height: '20px', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Warning
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

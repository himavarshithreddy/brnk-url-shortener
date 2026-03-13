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
  const apiUrl = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/+$/, '');

  const doRedirect = useCallback(() => {
    window.location.replace(`${apiUrl}/${encodeURIComponent(shortCode)}`);
  }, [apiUrl, shortCode]);

  useEffect(() => {
    if (!shortCode || !/^[a-zA-Z0-9_-]+$/.test(shortCode)) {
      setError('Invalid short code.');
      return;
    }

    fetch(`${apiUrl}/track/${encodeURIComponent(shortCode)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Link not found');
        return res.json();
      })
      .then((data) => {
        setDestinationUrl(data.originalUrl);
      })
      .catch(() => {
        setError('Link not found');
      });
  }, [shortCode, apiUrl]);

  useEffect(() => {
    if (destinationUrl) {
      doRedirect();
    }
  }, [destinationUrl, doRedirect]);

  // Countdown timer — purely cosmetic, does not affect the redirect
  useEffect(() => {
    if (!destinationUrl) return;
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [destinationUrl, countdown]);

  if (error) {
    return (
      <div className="app-container">
        <Helmet>
          <title>Link Not Found | BRNK URL Shortener</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <main className="redirect-card" role="alert">
          <header className="app-header">
            <img src={logo} alt="BRNK logo" className="app-logo" />
            <h1 className="title">BRNK</h1>
          </header>
          <p className="error-message">{error}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Helmet>
        <title>Redirecting… | BRNK URL Shortener</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="You are being redirected to your destination via BRNK URL Shortener." />
      </Helmet>
      <main className="redirect-card">
        <header className="app-header">
          <img src={logo} alt="BRNK logo" className="app-logo" />
          <h1 className="title">BRNK</h1>
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

'use client';

import { FormEvent, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || '/api';
const SIGN_IN_TIMEOUT_MS = 15_000;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SIGN_IN_TIMEOUT_MS);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Sign in failed. Check your email and password.',
        );
      }

      localStorage.setItem('auth_token', data.token);
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError(
          'The sign-in service is taking too long to reach the database. Please try again shortly.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <main className="auth-page"><section className="auth-card">
      <a className="auth-brand" href="/">AIDATA <span>MARKETPLACE</span></a>
      <p className="eyebrow">WELCOME BACK</p><h1>Sign in to your account</h1>
      <p className="auth-intro">Access your marketplace dashboard, supplier research, and sales pipeline.</p>
      <form onSubmit={submit}>
        <div className="form-group"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">New to the marketplace? <a href="/register">Create an account</a></p>
      <a className="auth-home-link" href="/">← Back to marketplace</a>
    </section></main>
  );
}

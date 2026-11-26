'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';
const ENABLED = process.env.NEXT_PUBLIC_WEATHER_SUBSCRIPTIONS_TEST_ENABLED === 'true';

type Status = {
  hasAccess: boolean;
  subscription: {
    planKey: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export default function WeatherSubscriptionTestControls() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ENABLED) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    void fetch(API + '/weather-subscriptions/status', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    }).then(async response => {
      if (response.ok) setStatus(await response.json());
    }).catch(() => undefined);
  }, []);

  if (!ENABLED) return null;

  async function startCheckout(planKey: 'starter' | 'team' | 'multi_site') {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      window.location.assign('/login');
      return;
    }
    setBusy(planKey);
    setError('');
    try {
      const response = await fetch(API + '/weather-subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ planKey }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || typeof result.checkoutUrl !== 'string') {
        throw new Error(result.error || 'Test checkout is not available.');
      }
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start test checkout.');
      setBusy('');
    }
  }

  async function openPortal() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      window.location.assign('/login');
      return;
    }
    setBusy('portal');
    setError('');
    try {
      const response = await fetch(API + '/weather-subscriptions/portal', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || typeof result.portalUrl !== 'string') {
        throw new Error(result.error || 'Billing management is not available.');
      }
      window.location.assign(result.portalUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open billing management.');
      setBusy('');
    }
  }

  const buttonStyle = {
    padding: 10,
    borderRadius: 8,
    border: 0,
    background: '#67e8f9',
    color: '#04111b',
    fontWeight: 800 as const,
    cursor: 'pointer',
  };

  return (
    <section aria-label="Weather subscription test controls" style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#172a40', border: '1px solid #67e8f9' }}>
      <strong style={{ color: '#a5f3fc' }}>Stripe test mode only</strong>
      <p style={{ color: '#cbd5e1', margin: '6px 0 12px', fontSize: 13 }}>Preview testing only. Use Stripe test card details; no real money can be collected. Sign in to test checkout and cancellation.</p>
      {status?.subscription && <p style={{ color: '#e2e8f0', fontSize: 13 }}>Test subscription: {status.subscription.planKey} · {status.subscription.status} · {status.subscription.cancelAtPeriodEnd ? 'cancels at period end' : 'renews unless cancelled'}.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle} disabled={Boolean(busy)} onClick={() => void startCheckout('starter')}>{busy === 'starter' ? 'Opening…' : 'Test Starter · $19/mo'}</button>
        <button type="button" style={buttonStyle} disabled={Boolean(busy)} onClick={() => void startCheckout('team')}>{busy === 'team' ? 'Opening…' : 'Test Team · $39/mo'}</button>
        <button type="button" style={buttonStyle} disabled={Boolean(busy)} onClick={() => void startCheckout('multi_site')}>{busy === 'multi_site' ? 'Opening…' : 'Test Multi-site · $59/mo'}</button>
        {status?.subscription && <button type="button" style={{ ...buttonStyle, background: '#0b1220', color: '#e2e8f0', border: '1px solid #64748b' }} disabled={Boolean(busy)} onClick={() => void openPortal()}>{busy === 'portal' ? 'Opening…' : 'Manage / cancel test plan'}</button>}
      </div>
      {error && <p role="alert" style={{ color: '#fecaca', fontSize: 13 }}>{error}</p>}
    </section>
  );
}

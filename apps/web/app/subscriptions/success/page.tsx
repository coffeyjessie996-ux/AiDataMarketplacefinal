'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type SubscriptionResult = {
  subscriptionId: string;
  datasetTitle: string;
  status: string;
  interval: string;
  amountCents: number;
  currentPeriodEnd: string | null;
};

export default function SubscriptionSuccessPage() {
  const [result, setResult] = useState<SubscriptionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    const token = localStorage.getItem('auth_token');
    if (!sessionId || !token) {
      setError('Sign in with the purchasing account to view this subscription.');
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const response = await fetch(`${API}/subscriptions/checkout-session/${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to verify subscription.');
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to verify subscription.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <main className="page-shell" style={{ maxWidth: 760, margin: '48px auto', padding: 24 }}>
      <section className="stat-card">
        <span className="eyebrow">SUBSCRIPTION STATUS</span>
        <h1>{loading ? 'Verifying your subscription…' : result ? 'Subscription checkout received' : 'Subscription status unavailable'}</h1>
        {error && <p role="alert">{error}</p>}
        {result && (
          <>
            <p><strong>{result.datasetTitle}</strong></p>
            <p>{money(result.amountCents)} / {result.interval === 'year' ? 'year' : 'month'}</p>
            <p>Status: <strong>{result.status}</strong></p>
            <p>{result.status === 'active' || result.status === 'trialing'
              ? 'Your subscription is active. Dataset access is available while the subscription remains current.'
              : 'Stripe has returned the checkout session. Access will unlock only after the signed payment webhook confirms the subscription.'}</p>
          </>
        )}
        <a href="/dashboard" className="primary-button">Go to dashboard</a>
      </section>
    </main>
  );
}

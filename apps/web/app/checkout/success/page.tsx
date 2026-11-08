'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type OrderState = {
  orderId: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  currency: string;
};

export default function CheckoutSuccessPage() {
  const [order, setOrder] = useState<OrderState | null>(null);
  const [message, setMessage] = useState('Verifying your payment securely…');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      const expectedOrderId = params.get('order_id');
      const token = localStorage.getItem('auth_token');
      if (!sessionId) {
        setError('The Checkout session reference is missing. Open your order history or contact support.');
        setMessage('');
        return;
      }
      if (!token) {
        setError('Please sign in with the account used at checkout to verify and download your purchase.');
        setMessage('');
        return;
      }

      let latestStatus = '';
      for (let attempt = 0; attempt < 15 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`${API}/orders/checkout-session/${encodeURIComponent(sessionId)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Unable to verify this checkout.');
          if (expectedOrderId && data.orderId !== expectedOrderId) throw new Error('The payment session does not match this order.');
          if (cancelled) return;
          latestStatus = data.status;
          setOrder(data as OrderState);
          if (data.status === 'paid') {
            setMessage('Payment confirmed. Your purchased dataset is ready.');
            return;
          }
          if (data.status === 'failed') {
            setMessage('This payment was not completed. No download is available.');
            return;
          }
          setMessage('Payment is being confirmed by Stripe. This page will update automatically.');
        } catch (err) {
          if (cancelled) return;
          if (attempt === 14) {
            setError(err instanceof Error ? err.message : 'Unable to verify this checkout.');
            setMessage('');
            return;
          }
        }
        await new Promise(resolve => window.setTimeout(resolve, 2000));
      }
      if (!cancelled && latestStatus !== 'paid' && latestStatus !== 'failed') {
        setMessage('Payment confirmation is taking longer than usual. Refresh this page in a moment; downloads unlock only after confirmation.');
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, []);

  const download = async () => {
    if (!order?.orderId) return;
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Please sign in again to download this purchase.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      const response = await fetch(`${API}/orders/${encodeURIComponent(order.orderId)}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Download is not available yet.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'purchased-dataset.csv';
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download this dataset.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '32px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <section style={{ maxWidth: 680, margin: '8vh auto', padding: 26, background: '#101a2b', border: '1px solid #334155', borderRadius: 14 }}>
        <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>AI DATA MARKETPLACE</p>
        <h1 style={{ fontSize: 30, margin: '8px 0 12px' }}>Checkout result</h1>
        <p role="status" style={{ color: '#cbd5e1', lineHeight: 1.6 }}>{message}</p>
        {order && <p style={{ color: '#94a3b8', fontSize: 13 }}>Order: {order.orderId} · Status: {order.status}</p>}
        {order?.status === 'paid' && (
          <button onClick={download} disabled={downloading} style={{ border: 0, borderRadius: 8, padding: '12px 18px', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: downloading ? 'wait' : 'pointer' }}>
            {downloading ? 'Preparing download…' : 'Download purchased dataset (CSV)'}
          </button>
        )}
        {error && <p role="alert" style={{ color: '#fca5a5', marginTop: 14 }}>{error}</p>}
        <p style={{ marginTop: 24 }}><a href="/dashboard" style={{ color: '#93c5fd' }}>Return to dashboard</a></p>
      </section>
    </main>
  );
}

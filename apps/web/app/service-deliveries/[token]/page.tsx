'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function ServiceDeliveryPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [content, setContent] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetch(`${API}/service-deliveries/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'This delivery is not available.');
        return result;
      })
      .then(result => {
        if (!active) return;
        setContent(typeof result.content === 'string' ? result.content : '');
        setServiceKey(typeof result.serviceKey === 'string' ? result.serviceKey : '');
        setDeliveredAt(typeof result.deliveredAt === 'string' ? result.deliveredAt : '');
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load delivery.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  return (
    <main style={{ minHeight: '100vh', padding: '32px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <article style={{ maxWidth: 900, margin: '0 auto', padding: 24, borderRadius: 14, border: '1px solid #334155', background: '#101a2b' }}>
        <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 800 }}>AI DATA MARKETPLACE · SECURE DELIVERY</p>
        <h1 style={{ fontSize: 32, margin: '8px 0 18px' }}>Your service deliverable</h1>
        {loading ? <p style={{ color: '#a8b6ca' }}>Loading your delivery…</p> :
          error ? <p role="alert" style={{ padding: 14, borderRadius: 8, background: '#451a1a', color: '#fecaca' }}>{error}</p> :
          <>
            <p style={{ color: '#93a4bd', fontSize: 13 }}>Service: {serviceKey.replace(/-/g, ' ')}{deliveredAt ? ` · Delivered ${new Date(deliveredAt).toLocaleString()}` : ''}</p>
            <section style={{ marginTop: 18, padding: 18, borderRadius: 10, background: '#0b1220', border: '1px solid #334155', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7 }}>{content}</section>
            <p style={{ color: '#93a4bd', fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>This private link is intended for the purchasing customer. Please do not share it publicly.</p>
          </>
        }
      </article>
    </main>
  );
}

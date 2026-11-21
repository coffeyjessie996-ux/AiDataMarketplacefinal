'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';
type ServiceOrder = {
  leadId: string; companyName: string; buyerName: string | null; buyerEmail: string | null;
  serviceKey: string; amountCents: number; paidAt: string; proposalDescription: string;
  deliveryStatus: 'DELIVERED' | 'AWAITING_DELIVERY'; deliveryToken: string | null;
};

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function ServiceFulfillmentPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Sign in with a seller or administrator account.');
      const response = await fetch(`${API}/pipeline/service-orders`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load paid service orders.');
      setOrders(Array.isArray(body.orders) ? body.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load paid service orders.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const publish = async (order: ServiceOrder) => {
    const content = (drafts[order.leadId] || '').trim();
    if (content.length < 20) { setError('Add at least 20 characters of completed deliverable content.'); return; }
    setBusy(order.leadId); setError(''); setNotice('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/pipeline/service-orders/${order.leadId}/deliverable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to publish deliverable.');
      setLinks(current => ({ ...current, [order.leadId]: body.deliveryUrl }));
      setNotice('Secure delivery link created. Copy it and send it only to the paying buyer.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish deliverable.');
    } finally { setBusy(''); }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setNotice('Delivery link copied. Send it only to the paying buyer.'); }
    catch { setError('Could not copy automatically. You can select and copy the link.'); }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1050, margin: '0 auto' }}>
        <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 26 }}>
          <a href="/revenue" style={{ color: '#93c5fd' }}>← Revenue engine</a>
          <a href="/agents" style={{ color: '#93c5fd' }}>AI agents</a>
          <a href="/dashboard" style={{ color: '#93c5fd' }}>Dashboard</a>
        </nav>
        <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 800 }}>PAID SERVICE FULFILLMENT</p>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 42px)', margin: '8px 0' }}>Delivery queue</h1>
        <p style={{ color: '#a8b6ca', lineHeight: 1.6, maxWidth: 820 }}>Only services confirmed paid by Stripe appear here. Complete the agreed work, paste the deliverable, and create a private link for the buyer. The app does not email the link automatically.</p>
        {error && <p role="alert" style={{ padding: 12, borderRadius: 8, background: '#451a1a', color: '#fecaca' }}>{error}</p>}
        {notice && <p role="status" style={{ padding: 12, borderRadius: 8, background: '#123329', color: '#bbf7d0' }}>{notice}</p>}
        {loading ? <p style={{ color: '#94a3b8' }}>Loading confirmed payments…</p> :
          orders.length ? <section style={{ display: 'grid', gap: 14 }}>
            {orders.map(order => {
              const link = links[order.leadId] || (order.deliveryToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/service-deliveries/${order.deliveryToken}` : '');
              return <article key={order.leadId} style={{ padding: 18, border: '1px solid #334155', borderRadius: 12, background: '#101a2b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 19, margin: '0 0 6px' }}>{order.companyName}</h2>
                    <p style={{ color: '#cbd5e1', margin: 0 }}>{order.buyerName || 'Buyer'} · {order.buyerEmail}</p>
                    <p style={{ color: '#93a4bd', fontSize: 12 }}>{order.serviceKey.replace(/-/g, ' ')} · Paid {new Date(order.paidAt).toLocaleString()}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: 24 }}>{money(order.amountCents)}</strong>
                    <p style={{ color: order.deliveryStatus === 'DELIVERED' ? '#86efac' : '#fbbf24', fontSize: 12, fontWeight: 700 }}>{order.deliveryStatus === 'DELIVERED' ? 'DELIVERY LINK READY' : 'PAID · AWAITING DELIVERY'}</p>
                  </div>
                </div>
                {order.proposalDescription && <div style={{ padding: 12, background: '#17263a', borderRadius: 8, margin: '12px 0', color: '#cbd5e1', whiteSpace: 'pre-wrap' }}><strong>Agreed checkout scope</strong><p style={{ marginBottom: 0 }}>{order.proposalDescription}</p></div>}
                {link ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <label style={{ color: '#93a4bd', fontSize: 12 }}>Private buyer delivery link
                    <input readOnly value={link} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 5, padding: 10, borderRadius: 7, border: '1px solid #475569', background: '#0b1220', color: 'white' }} />
                  </label>
                  <button onClick={() => void copy(link)} style={{ justifySelf: 'start', padding: '9px 13px', borderRadius: 7, background: '#0f766e', color: 'white', border: 0 }}>Copy delivery link</button>
                </div> : <div style={{ marginTop: 14 }}>
                  <label style={{ color: '#93a4bd', fontSize: 12 }}>Completed deliverable (plain text, report, or instructions)
                    <textarea rows={8} maxLength={50000} value={drafts[order.leadId] || ''} onChange={event => setDrafts(current => ({ ...current, [order.leadId]: event.target.value }))} placeholder="Paste the completed work here. Check it against the agreed scope and source permissions before publishing." style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 5, padding: 11, borderRadius: 7, border: '1px solid #475569', background: '#0b1220', color: 'white', lineHeight: 1.5 }} />
                  </label>
                  <button disabled={busy === order.leadId} onClick={() => void publish(order)} style={{ marginTop: 10, padding: '10px 15px', borderRadius: 7, background: busy === order.leadId ? '#475569' : '#2563eb', color: 'white', border: 0, fontWeight: 700 }}>{busy === order.leadId ? 'Publishing securely…' : 'Create buyer delivery link'}</button>
                </div>}
              </article>;
            })}
          </section> : <p style={{ padding: 18, border: '1px solid #334155', borderRadius: 10, color: '#a8b6ca' }}>No Stripe-confirmed service payments are awaiting delivery yet. Paid services will appear here automatically after the signed webhook confirms payment.</p>
        }
      </div>
    </main>
  );
}

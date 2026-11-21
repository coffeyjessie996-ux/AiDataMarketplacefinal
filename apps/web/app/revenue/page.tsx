'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Inquiry = {
  id: string;
  buyerName: string | null;
  buyerEmail: string | null;
  companyName: string | null;
  interest: string | null;
  message: string | null;
  status: string;
  createdAt: string;
};
type OfferCount = { interest: string | null; status: string; count: number };
type RevenueData = {
  windowDays: number;
  updatedAt: string;
  inquiries: Inquiry[];
  inquiriesByOffer: OfferCount[];
  actualPaidOrderValueCents: number;
  actualPaidOrders: number;
  actualPaidServiceValueCents?: number;
  actualPaidServiceOrders?: number;
  actualPaidTotalValueCents?: number;
  definitions: { inquiries: string; revenue: string };
};

const labels: Record<string, string> = {
  'supplier-intelligence': 'Supplier intelligence',
  'engineering-awards': 'Engineering awards research',
  'agency-trends': 'Agency and competitor trends',
  'custom-research': 'Custom research',
  'weather-planning': 'Weather planning',
  'supplier-monitoring': 'Supplier monitoring',
  'data-cleaning': 'Data cleaning and enrichment',
  'rfp-intelligence': 'RFP and contract intelligence',
  'business-reports': 'Industry and business reports',
  'data-api': 'Business data API',
  'workflow-automation': 'Workflow automation',
  'white-label-intelligence': 'White-label intelligence',
};

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function RevenueEnginePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [servicePrices, setServicePrices] = useState<Record<string, string>>({});
  const [serviceScopes, setServiceScopes] = useState<Record<string, string>>({});
  const [checkoutLinks, setCheckoutLinks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in with a seller or administrator account.');
      const response = await fetch(`${API}/demand/revenue-summary`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to load revenue demand data.');
      setData(result as RevenueData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load revenue demand data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: 'CONTACTED' | 'CLOSED') => {
    setBusyId(id);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/buyer-inquiries/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to update inquiry.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update inquiry.');
    } finally {
      setBusyId('');
    }
  };

  const createServiceCheckout = async (inquiry: Inquiry) => {
    const amount = Number(servicePrices[inquiry.id]);
    const proposalDescription = (serviceScopes[inquiry.id] || '').trim();
    if (proposalDescription.length < 20) {
      setError('Describe the deliverables and scope (at least 20 characters) before creating checkout.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 5 || amount > 10000) {
      setError('Enter a quote between $5 and $10,000 before creating checkout.');
      return;
    }
    setBusyId(inquiry.id);
    setError('');
    setNotice('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/pipeline/buyer-inquiries/${inquiry.id}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: Math.round(amount * 100), proposalDescription }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not create service checkout.');
      if (typeof result.checkoutUrl !== 'string') throw new Error('Stripe did not return a checkout link.');
      setCheckoutLinks(current => ({ ...current, [inquiry.id]: result.checkoutUrl }));
      setNotice('Stripe checkout link created. Copy it and send it to the buyer who requested this quote. The seller is not being sent to the payment page.');
      setBusyId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create service checkout.');
      setBusyId('');
    }
  };

  const totals = (data?.inquiriesByOffer || []).reduce<Record<string, number>>((acc, item) => {
    const key = item.interest || 'unspecified';
    acc[key] = (acc[key] || 0) + item.count;
    return acc;
  }, {});

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          <a href="/dashboard" style={{ color: '#93c5fd' }}>← Dashboard</a>
          <a href="/agents" style={{ color: '#93c5fd' }}>AI agents</a>
          <a href="/pipeline" style={{ color: '#93c5fd' }}>Sales pipeline</a>
          <a href="/revenue/fulfillment" style={{ color: '#93c5fd' }}>Paid service delivery</a>
          <a href="/for-businesses" style={{ color: '#93c5fd' }}>Buyer offers page</a>
        </nav>
        <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>GROWTH OPERATIONS</p>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 42px)', margin: '8px 0' }}>Revenue engine</h1>
        <p style={{ color: '#a8b6ca', lineHeight: 1.6, maxWidth: 850 }}>Track which services real buyers ask for, create seller-priced Stripe checkout for consented requests, and separate confirmed payments from demand signals.</p>
        {error && <p role="alert" style={{ padding: 12, borderRadius: 8, background: '#451a1a', color: '#fecaca' }}>{error}</p>}
        {notice && <p role="status" style={{ padding: 12, borderRadius: 8, background: '#123329', color: '#bbf7d0' }}>{notice}</p>}
        {loading ? <p style={{ color: '#94a3b8' }}>Loading verified demand and payment records…</p> : data && <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12, margin: '22px 0' }}>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 18 }}>
              <div style={{ color: '#93a4bd', fontSize: 12 }}>Stripe-confirmed paid orders</div>
              <strong style={{ fontSize: 28 }}>{data.actualPaidOrders}</strong>
            </article>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 18 }}>
              <div style={{ color: '#93a4bd', fontSize: 12 }}>Recorded paid order value</div>
              <strong style={{ fontSize: 28 }}>{money(data.actualPaidOrderValueCents + (data.actualPaidServiceValueCents || 0))}</strong>
              <div style={{ color: '#93a4bd', fontSize: 11 }}>Includes Stripe-confirmed service payments</div>
            </article>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 18 }}>
              <div style={{ color: '#93a4bd', fontSize: 12 }}>Stripe-confirmed paid service orders</div>
              <strong style={{ fontSize: 28 }}>{data.actualPaidServiceOrders || 0}</strong>
              <div style={{ color: '#93a4bd', fontSize: 11 }}>{money(data.actualPaidServiceValueCents || 0)} service payments</div>
            </article>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 18 }}>
              <div style={{ color: '#93a4bd', fontSize: 12 }}>Consented buyer inquiries</div>
              <strong style={{ fontSize: 28 }}>{data.inquiries.length}</strong>
              <div style={{ color: '#93a4bd', fontSize: 11 }}>Latest 90 days · max 100 shown</div>
            </article>
          </section>
          <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 18, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Demand by revenue stream</h2>
              <span style={{ color: '#93a4bd', fontSize: 12 }}>Updated {new Date(data.updatedAt).toLocaleString()}</span>
            </div>
            {Object.keys(totals).length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginTop: 16 }}>
              {Object.entries(totals).sort((a,b) => b[1]-a[1]).map(([key,count]) => (
                <div key={key} style={{ background: '#17263a', padding: 14, borderRadius: 8 }}>
                  <div style={{ color: '#cbd5e1', fontSize: 13 }}>{labels[key] || key}</div>
                  <strong style={{ fontSize: 24 }}>{count}</strong>
                  <div style={{ color: '#93a4bd', fontSize: 11 }}>Buyer inquiries</div>
                </div>
              ))}
            </div> : <p style={{ color: '#93a4bd' }}>No consented buyer inquiries in the last 90 days yet. The public buyer offers page is ready to collect them.</p>}
          </section>
          <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #26364d', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Buyer requests</h2>
              <button onClick={() => void load()} style={{ padding: '8px 12px', borderRadius: 7, background: '#1e293b', color: 'white', border: '1px solid #475569' }}>Refresh</button>
            </div>
            {data.inquiries.length ? data.inquiries.map(item => (
              <article key={item.id} style={{ padding: 16, borderBottom: '1px solid #26364d' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{item.companyName || 'Company not supplied'}</strong>
                    <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>{item.buyerName || 'Name not supplied'} · {item.buyerEmail}</div>
                    <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 5 }}>{labels[item.interest || ''] || item.interest || 'Other request'}</div>
                  </div>
                  <span style={{ color: item.status === 'NEW' ? '#fbbf24' : '#86efac', fontSize: 12, fontWeight: 700 }}>{item.status}</span>
                </div>
                {item.message && <p style={{ color: '#a8b6ca', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.message}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ color: '#8291a7', fontSize: 11 }}>Received {new Date(item.createdAt).toLocaleString()}</span>
                  {item.status === 'NEW' && <button disabled={busyId === item.id} onClick={() => void updateStatus(item.id, 'CONTACTED')} style={{ padding: '8px 11px', borderRadius: 7, background: '#0f766e', color: 'white', border: 0 }}>Mark contacted</button>}
                  {item.status !== 'CLOSED' && <button disabled={busyId === item.id} onClick={() => void updateStatus(item.id, 'CLOSED')} style={{ padding: '8px 11px', borderRadius: 7, background: '#334155', color: 'white', border: 0 }}>Close request</button>}
                  {['NEW', 'CONTACTED'].includes(item.status) && <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', width: '100%', marginTop: 8 }}>
                    <label style={{ color: '#93a4bd', fontSize: 12 }}>Your quote ($)
                      <input type="number" min="5" max="10000" step="0.01" inputMode="decimal" value={servicePrices[item.id] || ''} onChange={event => setServicePrices(current => ({ ...current, [item.id]: event.target.value }))} placeholder="e.g. 99.00" style={{ display: 'block', marginTop: 4, padding: 8, width: 125, borderRadius: 7, border: '1px solid #475569', background: '#0b1220', color: 'white' }} />
                    </label>
                    <label style={{ color: '#93a4bd', fontSize: 12, width: '100%' }}>Deliverables and scope shown at checkout
                      <textarea rows={3} maxLength={1000} value={serviceScopes[item.id] || ''} onChange={event => setServiceScopes(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Describe exactly what the buyer receives, included revisions, and any limits." style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 4, padding: 9, borderRadius: 7, border: '1px solid #475569', background: '#0b1220', color: 'white' }} />
                    </label>
                    <button disabled={busyId === item.id} onClick={() => void createServiceCheckout(item)} style={{ marginTop: 18, padding: '9px 13px', borderRadius: 7, background: busyId === item.id ? '#475569' : '#2563eb', color: 'white', border: 0, fontWeight: 700 }}>{busyId === item.id ? 'Preparing checkout…' : 'Create Stripe checkout'}</button>
                    <span style={{ color: '#8291a7', fontSize: 11 }}>Buyer pays through Stripe; only confirmed payment counts as revenue. Creating the link does not charge anyone.</span>
                    {checkoutLinks[item.id] && <div style={{ width: '100%', display: 'grid', gap: 8, marginTop: 8 }}>
                      <label style={{ color: '#93a4bd', fontSize: 12 }}>Stripe checkout link for this buyer
                        <input readOnly value={checkoutLinks[item.id]} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 4, padding: 9, borderRadius: 7, border: '1px solid #475569', background: '#0b1220', color: 'white' }} />
                      </label>
                      <button type="button" onClick={() => { void navigator.clipboard.writeText(checkoutLinks[item.id]).then(() => setNotice('Checkout link copied. Send it only to the buyer who requested the quote.')).catch(() => setError('Select and copy the checkout link above.')); }} style={{ justifySelf: 'start', padding: '8px 12px', borderRadius: 7, background: '#0f766e', color: 'white', border: 0 }}>Copy buyer checkout link</button>
                    </div>}
                  </div>}
                </div>
              </article>
            )) : <p style={{ padding: 18, color: '#93a4bd' }}>No consented inquiries yet. Share the buyer offers page to test demand.</p>}
          </section>
          <p style={{ color: '#8291a7', fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>{data.definitions.inquiries} {data.definitions.revenue}</p>
        </>}
      </div>
    </main>
  );
}

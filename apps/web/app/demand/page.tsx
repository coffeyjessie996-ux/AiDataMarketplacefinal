'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type BuyerInquiry = { id: string; buyerName: string | null; buyerEmail: string | null; companyName: string | null; interest: string | null; message: string | null; status: string; createdAt: string };

type DemandSummary = {
  source: string;
  windowDays: number;
  totalSearches: number;
  zeroResultSearches: number;
  topQueries: Array<{ query: string; searches: number; averageResults: number }>;
  categoryDemand: Array<{ category: string | null; searches: number }>;
  note: string;
};

export default function BuyerDemandPage() {
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [inquiries, setInquiries] = useState<BuyerInquiry[]>([]);
  const [updatingInquiry, setUpdatingInquiry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Please sign in with a seller or admin account.');
        const [response, inquiryResponse] = await Promise.all([fetch(`${API}/demand/summary`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }), fetch(`${API}/buyer-inquiries`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })]);
        const data = await response.json().catch(() => ({}));
        const inquiryData = await inquiryResponse.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to load buyer demand.');
        if (!inquiryResponse.ok) throw new Error(inquiryData.error || 'Unable to load buyer inquiries.');
        if (!cancelled) { setSummary(data as DemandSummary); setInquiries(Array.isArray(inquiryData.inquiries) ? inquiryData.inquiries : []); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load buyer demand.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);


  async function updateInquiry(id: string, status: 'NEW' | 'CONTACTED' | 'CLOSED') {
    setUpdatingInquiry(id);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(`${API}/buyer-inquiries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to update inquiry.');
      setInquiries(current => current.map(item => item.id === id ? { ...item, status } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update inquiry.');
    } finally {
      setUpdatingInquiry(null);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <nav style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 26 }}>
          <a href="/dashboard" style={{ color: '#93c5fd' }}>← Dashboard</a>
          <a href="/" style={{ color: '#93c5fd' }}>Browse marketplace</a>
          <a href="/product-factory" style={{ color: '#93c5fd' }}>Data Product Factory</a>
        </nav>
        <header style={{ marginBottom: 24 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>SELLER INTELLIGENCE</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', margin: '8px 0 10px' }}>Buyer Demand Intelligence</h1>
          <p style={{ color: '#a8b6ca', maxWidth: 800, lineHeight: 1.6 }}>
            See what visitors actually search for in the marketplace. Use repeated searches and searches with no matching products to decide what data products to research next.
          </p>
        </header>

        {loading && <p style={{ color: '#94a3b8' }}>Loading recorded search activity…</p>}
        {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
        {summary && <>
        <section style={{ marginTop: 22, background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>GovCon buyer inquiry inbox</h2>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Requests submitted through the public business-buyer page. These are inquiries, not confirmed buyers or sales.</p>
            </div>
            <strong style={{ color: '#93c5fd' }}>{inquiries.filter(item => item.status === 'NEW').length} new</strong>
          </div>
          {inquiries.length === 0 ? <p style={{ color: '#94a3b8', marginTop: 16 }}>No buyer inquiries yet. New requests will appear here when visitors submit the buyer form.</p> : (
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {inquiries.map(item => (
                <article key={item.id} style={{ padding: 14, border: '1px solid #29384d', borderRadius: 9, background: '#0e1828' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{item.companyName || 'Company not provided'}</strong>
                      <p style={{ color: '#cbd5e1', margin: '4px 0' }}>{item.buyerName || 'Buyer'} · <a href={item.buyerEmail ? `mailto:${item.buyerEmail}` : '#'} style={{ color: '#7dd3fc' }}>{item.buyerEmail || 'No email'}</a></p>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>{(item.interest || '').replaceAll('-', ' ')} · {new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                    <select aria-label="Inquiry status" value={item.status} disabled={updatingInquiry === item.id} onChange={event => void updateInquiry(item.id, event.target.value as 'NEW' | 'CONTACTED' | 'CLOSED')} style={{ height: 36, padding: '0 9px', borderRadius: 6, background: '#0b1220', color: '#e5edf8', border: '1px solid #475569' }}>
                      <option value="NEW">New</option><option value="CONTACTED">Contacted</option><option value="CLOSED">Closed</option>
                    </select>
                  </div>
                  {item.message && <p style={{ color: '#cbd5e1', lineHeight: 1.6, margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{item.message}</p>}
                </article>
              ))}
            </div>
          )}
        </section>


          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>Searches · last 30 days</p>
              <strong style={{ display: 'block', fontSize: 32, marginTop: 8 }}>{summary.totalSearches.toLocaleString()}</strong>
            </article>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>Searches with no results</p>
              <strong style={{ display: 'block', fontSize: 32, marginTop: 8 }}>{summary.zeroResultSearches.toLocaleString()}</strong>
            </article>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>Demand signals</p>
              <strong style={{ display: 'block', fontSize: 32, marginTop: 8 }}>{summary.topQueries.length.toLocaleString()}</strong>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Distinct top search phrases</span>
            </article>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 19, marginTop: 0 }}>Top buyer searches</h2>
              {summary.topQueries.length === 0 ? <p style={{ color: '#94a3b8' }}>No searches recorded yet. Real search activity will appear here as visitors use the marketplace search bar.</p> : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {summary.topQueries.map((item) => <div key={item.query} style={{ paddingBottom: 10, borderBottom: '1px solid #26364d' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong style={{ overflowWrap: 'anywhere' }}>{item.query}</strong>
                      <span style={{ color: '#93c5fd', whiteSpace: 'nowrap' }}>{item.searches} searches</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Average matching products: {item.averageResults}</span>
                  </div>)}
                </div>
              )}
            </article>
            <article style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 19, marginTop: 0 }}>Category interest</h2>
              {summary.categoryDemand.length === 0 ? <p style={{ color: '#94a3b8' }}>Category-level demand will appear as searches are categorized.</p> : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {summary.categoryDemand.map((item) => <div key={item.category || 'uncategorized'} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingBottom: 10, borderBottom: '1px solid #26364d' }}>
                    <strong>{item.category || 'Uncategorized'}</strong><span style={{ color: '#93c5fd' }}>{item.searches} searches</span>
                  </div>)}
                </div>
              )}
            </article>
          </section>
          <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>{summary.note} New searches will populate this page as visitors use marketplace search.</p>
        </>}
      </div>
    </main>
  );
}

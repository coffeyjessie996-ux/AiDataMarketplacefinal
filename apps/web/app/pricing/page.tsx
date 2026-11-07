'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Recommendation = {
  datasetId: string;
  title: string;
  category: string;
  currentPriceCents: number;
  qualityScore: number;
  benchmarkMedianCents: number | null;
  suggestedPriceCents: number | null;
  qualityAdjustmentPercent: number;
  comparableListings: number;
  demandSearchesLast30Days: number;
  paidOrdersRecorded: number;
  paidOrderValueCents: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
};

type ResponseData = {
  source: string;
  windowDays: number;
  recommendations: Recommendation[];
  note: string;
};

const money = (cents: number | null) => cents === null
  ? 'Not enough data'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function PricingIntelligencePage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Please sign in with a seller or admin account.');
        const response = await fetch(`${API}/pricing/recommendations`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to load pricing recommendations.');
        if (!cancelled) setData(result as ResponseData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load pricing recommendations.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <nav style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 26 }}>
          <a href="/dashboard" style={{ color: '#93c5fd' }}>← Dashboard</a>
          <a href="/demand" style={{ color: '#93c5fd' }}>Buyer demand</a>
          <a href="/" style={{ color: '#93c5fd' }}>Browse marketplace</a>
        </nav>
        <header style={{ marginBottom: 24 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>SELLER INTELLIGENCE</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', margin: '8px 0 10px' }}>Pricing Intelligence</h1>
          <p style={{ color: '#a8b6ca', maxWidth: 820, lineHeight: 1.6 }}>
            Compare your published products with other sellers’ published listings in the same category. Recommendations use stored quality scores and real marketplace records.
          </p>
        </header>

        {loading && <p style={{ color: '#94a3b8' }}>Calculating recommendations from marketplace records…</p>}
        {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
        {data && <>
          {data.recommendations.length === 0 ? (
            <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>No published products to review yet</h2>
              <p style={{ color: '#a8b6ca' }}>Publish a properly reviewed product before pricing recommendations can be calculated. Drafts and restricted products are not included.</p>
            </section>
          ) : (
            <section style={{ display: 'grid', gap: 14 }}>
              {data.recommendations.map((item) => (
                <article key={item.datasetId} style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h2 style={{ fontSize: 20, margin: '0 0 5px' }}>{item.title}</h2>
                      <p style={{ color: '#94a3b8', margin: 0 }}>{item.category} · Quality score {item.qualityScore}/100</p>
                    </div>
                    <span style={{ border: '1px solid #475569', borderRadius: 999, padding: '5px 10px', color: '#cbd5e1', fontSize: 12 }}>
                      {item.confidence.toUpperCase()} CONFIDENCE
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12, margin: '18px 0' }}>
                    <div><small style={{ color: '#94a3b8' }}>Current price</small><strong style={{ display: 'block', fontSize: 21 }}>{money(item.currentPriceCents)}</strong></div>
                    <div><small style={{ color: '#94a3b8' }}>Suggested price</small><strong style={{ display: 'block', fontSize: 21, color: item.suggestedPriceCents === null ? '#cbd5e1' : '#86efac' }}>{money(item.suggestedPriceCents)}</strong></div>
                    <div><small style={{ color: '#94a3b8' }}>Competitor median</small><strong style={{ display: 'block', fontSize: 21 }}>{money(item.benchmarkMedianCents)}</strong></div>
                    <div><small style={{ color: '#94a3b8' }}>Comparable listings</small><strong style={{ display: 'block', fontSize: 21 }}>{item.comparableListings}</strong></div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: '#cbd5e1', fontSize: 13 }}>
                    <span>{item.demandSearchesLast30Days} related searches · 30 days</span>
                    <span>{item.paidOrdersRecorded} paid orders recorded</span>
                    <span>{money(item.paidOrderValueCents)} recorded paid order value</span>
                    <span>Quality adjustment {item.qualityAdjustmentPercent > 0 ? '+' : ''}{item.qualityAdjustmentPercent}%</span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 0 }}>{item.note}</p>
                </article>
              ))}
            </section>
          )}
          <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>{data.note}</p>
        </>}
      </div>
    </main>
  );
}

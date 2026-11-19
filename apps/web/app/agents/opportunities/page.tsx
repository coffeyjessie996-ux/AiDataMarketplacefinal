'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Opportunity = {
  id: string; source: string; title: string; company: string; description: string;
  location: string; url: string; postedAt: string | null; compensation: string;
  type: 'remote-role' | 'government-solicitation'; applicationRequired: boolean;
};

type SearchResult = {
  ok: boolean;
  opportunities: Opportunity[];
  sources: { name: string; url: string; count: number; note: string }[];
  note: string;
};

export default function OpportunitiesPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function search() {
    setBusy(true); setError(''); setResult(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`${API}/agents/opportunities/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Opportunity search failed.');
      setResult(body as SearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opportunity search failed.');
    } finally { setBusy(false); }
  }

  async function saveOpportunity(item: Opportunity) {
    setSaving(item.id); setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/agents/opportunities/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save this opportunity.');
      setSaved(current => current.includes(item.id) ? current : [...current, item.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this opportunity.');
    } finally { setSaving(null); }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav style={{ marginBottom: 24, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <a href="/agents" style={{ color: '#93c5fd' }}>← Agent control center</a>
          <a href="/dashboard" style={{ color: '#93c5fd' }}>Dashboard</a>
        </nav>
        <header style={{ marginBottom: 22 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>AI OPPORTUNITY HUNTER</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 42px)', margin: '8px 0' }}>Find paid work online</h1>
          <p style={{ color: '#a8b6ca', lineHeight: 1.6, maxWidth: 800 }}>
            Search public remote roles and previously collected federal solicitation notices. The agent finds listings and organizes them; you review the source terms and submit applications or bids yourself.
          </p>
        </header>

        <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <label htmlFor="opportunity-query" style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>What kind of work should we look for?</label>
          <input id="opportunity-query" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }}
            placeholder="Try: data entry, research, spreadsheet, AI training…" style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 8, border: '1px solid #475569', background: '#0b1220', color: '#fff', marginBottom: 12 }} />
          <button onClick={() => void search()} disabled={busy} style={{ padding: '11px 18px', border: 0, borderRadius: 8, background: busy ? '#475569' : '#2563eb', color: 'white', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Searching public listings…' : 'Start Opportunity Hunter'}
          </button>
          <p style={{ color: '#93a4bd', fontSize: 12, marginBottom: 0 }}>Leave the search blank to find all supported categories. Search uses public listings; it does not create an account or submit applications.</p>
        </section>

        {error && <p role="alert" style={{ padding: 12, background: '#451a1a', color: '#fecaca', borderRadius: 8 }}>{error}</p>}
        {result && <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}><div style={{ color: '#93a4bd', fontSize: 12 }}>Matching opportunities</div><strong style={{ fontSize: 28 }}>{result.opportunities.length}</strong></div>
            {result.sources.map(source => <div key={source.name} style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}><div style={{ color: '#93a4bd', fontSize: 12 }}>{source.name}</div><strong style={{ fontSize: 28 }}>{source.count}</strong><div style={{ color: '#93a4bd', fontSize: 11 }}>{source.note}</div></div>)}
          </section>
          {result.opportunities.length ? <section style={{ display: 'grid', gap: 12 }}>
            {result.opportunities.map(item => <article key={item.id} style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div><span style={{ color: '#93c5fd', fontSize: 11, fontWeight: 700 }}>{item.source.toUpperCase()}</span><h2 style={{ margin: '6px 0', fontSize: 19 }}>{item.title}</h2><div style={{ color: '#cbd5e1' }}>{item.company} · {item.location}</div></div>
                <div style={{ color: '#bbf7d0', fontWeight: 700 }}>{item.compensation}</div>
              </div>
              <p style={{ color: '#a8b6ca', lineHeight: 1.55 }}>{item.description || 'Open the original listing for full requirements and terms.'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#93a4bd', fontSize: 12 }}>{item.postedAt ? `Listed: ${new Date(item.postedAt).toLocaleDateString()}` : 'Posting date not supplied'} · Apply or bid on source site</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void saveOpportunity(item)} disabled={saving === item.id || saved.includes(item.id)} style={{ padding: '9px 13px', borderRadius: 7, border: '1px solid #475569', background: saved.includes(item.id) ? '#14532d' : '#1e293b', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                    {saved.includes(item.id) ? 'Saved to pipeline' : saving === item.id ? 'Saving…' : 'Save to sales pipeline'}
                  </button>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ background: '#2563eb', color: 'white', padding: '9px 13px', borderRadius: 7, textDecoration: 'none', fontWeight: 700 }}>Review original listing ↗</a>
                </div>
              </div>
            </article>)}
          </section> : <p style={{ color: '#a8b6ca' }}>No matching listings were returned. Try a broader search or check again later.</p>}
          <p style={{ color: '#93a4bd', fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>{result.note}</p>
        </>}
      </div>
    </main>
  );
}

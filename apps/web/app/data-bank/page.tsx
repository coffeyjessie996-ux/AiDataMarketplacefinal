'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type SourceSummary = { source: string; count: number; latestRetrievedAt: string | null };
type Summary = {
  totalRecords: number;
  sourceCount: number;
  recordsMissingSupplierName: number;
  latestRetrievedAt: string | null;
  sources: SourceSummary[];
  note: string;
};
type BankRecord = {
  id: string;
  source: string;
  sourceRecordId: string;
  supplierName: string | null;
  awardAmount: string | null;
  sourceUrl: string;
  payload: Record<string, unknown>;
  retrievedAt: string;
  createdAt: string;
  quality: {
    populatedFieldCount: number;
    hasSupplierName: boolean;
    hasSourceLink: boolean;
    classification: string;
  };
};

function textValue(value: unknown, fallback = '—') {
  return value === null || value === undefined || String(value).trim() === '' ? fallback : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function formatMoney(value: string | null) {
  if (value === null) return '—';
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
    : '—';
}

export default function DataBankPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<BankRecord[]>([]);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const headers = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Please sign in to open the Data Bank.');
    return { Authorization: `Bearer ${token}` };
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const authHeaders = headers();
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (query.trim()) params.set('q', query.trim());
      if (source) params.set('source', source);
      const [summaryResponse, recordsResponse] = await Promise.all([
        fetch(`${API}/data-bank/summary`, { headers: authHeaders }),
        fetch(`${API}/data-bank/records?${params.toString()}`, { headers: authHeaders }),
      ]);
      const summaryData = await summaryResponse.json();
      const recordsData = await recordsResponse.json();
      if (!summaryResponse.ok) throw new Error(summaryData.error || 'Could not load Data Bank summary.');
      if (!recordsResponse.ok) throw new Error(recordsData.error || 'Could not load Data Bank records.');
      setSummary(summaryData);
      setRecords(Array.isArray(recordsData.records) ? recordsData.records : []);
      setTotal(Number(recordsData.total || 0));
      setPageCount(Math.max(1, Number(recordsData.pageCount || 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Data Bank.');
    } finally {
      setLoading(false);
    }
  }, [page, query, source]);

  useEffect(() => { void load(); }, [load]);

  const sourceLabel = (value: string) => value === 'usaspending.gov'
    ? 'USAspending.gov'
    : value === 'sam.gov_opportunities'
      ? 'SAM.gov opportunities'
      : value.replaceAll('_', ' ');

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
          <a href="/dashboard" style={{ color: '#93c5fd', textDecoration: 'none' }}>← Dashboard</a>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a href="/suppliers" style={{ color: '#93c5fd', textDecoration: 'none' }}>Supplier research</a>
            <a href="/pipeline" style={{ color: '#93c5fd', textDecoration: 'none' }}>Sales pipeline</a>
            <a href="/product-factory" style={{ color: '#93c5fd', textDecoration: 'none' }}>Data Product Factory</a>
            <a href="/agents" style={{ color: '#93c5fd', textDecoration: 'none' }}>Agent activity</a>
          </div>
        </nav>

        <header style={{ marginBottom: 24 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>CENTRAL RESEARCH STORAGE</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', margin: '8px 0 12px' }}>AI Data Bank</h1>
          <p style={{ color: '#a8b6ca', maxWidth: 800, lineHeight: 1.6 }}>
            One searchable library for research collected by connected sources. Each record keeps its original source, source ID, source link, and collection timestamps.
          </p>
        </header>

        {summary && <section aria-label="Data Bank summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 22 }}>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Stored research records</div>
            <strong style={{ fontSize: 28 }}>{summary.totalRecords.toLocaleString()}</strong>
          </div>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Connected data sources</div>
            <strong style={{ fontSize: 28 }}>{summary.sourceCount}</strong>
          </div>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Records without supplier name</div>
            <strong style={{ fontSize: 28 }}>{summary.recordsMissingSupplierName.toLocaleString()}</strong>
          </div>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Most recent collection</div>
            <strong style={{ fontSize: 14 }}>{formatDate(summary.latestRetrievedAt)}</strong>
          </div>
        </section>}

        {summary && <section style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16, marginBottom: 18 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>Records by source</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {summary.sources.map(item => <span key={item.source} style={{ background: '#17263a', borderRadius: 8, padding: '8px 11px', fontSize: 13 }}>
              {sourceLabel(item.source)} · {item.count.toLocaleString()}
            </span>)}
          </div>
        </section>}

        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search supplier name or source record ID" aria-label="Search Data Bank" style={{ flex: '1 1 260px', minWidth: 200, padding: 12, borderRadius: 8, background: '#111a2b', color: 'white', border: '1px solid #334155' }} />
          <select value={source} onChange={event => { setSource(event.target.value); setPage(1); }} aria-label="Filter by data source" style={{ minWidth: 190, padding: 12, borderRadius: 8, background: '#111a2b', color: 'white', border: '1px solid #334155' }}>
            <option value="">All data sources</option>
            {summary?.sources.map(item => <option key={item.source} value={item.source}>{sourceLabel(item.source)}</option>)}
          </select>
          <button onClick={() => void load()} disabled={loading} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #334155', background: '#172033', color: 'white' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </section>

        {error && <p role="alert" style={{ background: '#451a1a', color: '#fecaca', borderRadius: 8, padding: 12 }}>{error}</p>}

        <section style={{ border: '1px solid #26364d', borderRadius: 12, overflow: 'hidden', background: '#101a2b' }}>
          <div style={{ padding: 14, borderBottom: '1px solid #26364d', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong>Research library</strong>
            <span style={{ color: '#93a4bd', fontSize: 13 }}>{total.toLocaleString()} matching records · page {page} of {pageCount}</span>
          </div>
          {loading && records.length === 0 ? <p style={{ padding: 18, color: '#94a3b8' }}>Loading stored records…</p> : records.length === 0 ? (
            <p style={{ padding: 18, color: '#94a3b8' }}>No records match this search. Try another source or search term.</p>
          ) : <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: '#93a4bd', fontSize: 12 }}>
                {['Record / organization', 'Source', 'Amount', 'Record quality', 'Collected', 'Original record'].map(label => <th key={label} style={{ padding: 12, borderBottom: '1px solid #26364d' }}>{label}</th>)}
              </tr></thead>
              <tbody>{records.map(record => {
                const payload = record.payload || {};
                const title = textValue(payload.title || payload.description || payload.awardingAgency || payload.noticeId, 'Public record');
                const displayName = textValue(record.supplierName, title);
                const amount = formatMoney(record.awardAmount);
                return <tr key={record.id}>
                  <td style={{ padding: 12, borderBottom: '1px solid #26364d', maxWidth: 340 }}>
                    <strong>{displayName}</strong>
                    <div style={{ color: '#93a4bd', fontSize: 12, marginTop: 5 }}>{title}</div>
                    <div style={{ color: '#8291a7', fontSize: 11, marginTop: 5 }}>ID: {record.sourceRecordId}</div>
                    {Boolean(record.payload.aiResearchAnalysis && typeof record.payload.aiResearchAnalysis === 'object') && <div style={{ marginTop: 9, padding: 9, borderRadius: 7, background: '#172033', border: '1px solid #334155' }}>
                      <div style={{ color: '#86efac', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>AI RESEARCH TRIAGE · NOT VERIFIED</div>
                      <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 5 }}>{textValue((record.payload.aiResearchAnalysis as Record<string, unknown>).summary)}</div>
                      <div style={{ color: '#93a4bd', fontSize: 11, marginTop: 5 }}>AI triage score: {textValue((record.payload.aiResearchAnalysis as Record<string, unknown>).fitScore, '—')}/100</div>
                      <div style={{ color: '#93a4bd', fontSize: 11, marginTop: 4 }}>Next step: {textValue((record.payload.aiResearchAnalysis as Record<string, unknown>).nextStep)}</div>
                    </div>}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #26364d', whiteSpace: 'nowrap' }}>{sourceLabel(record.source)}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #26364d', whiteSpace: 'nowrap' }}>{amount}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #26364d' }}>
                    <span style={{ color: record.quality.hasSupplierName ? '#86efac' : '#fbbf24' }}>{record.quality.hasSupplierName ? 'Named supplier' : 'Name missing'}</span>
                    <div style={{ color: '#93a4bd', fontSize: 11, marginTop: 4 }}>{record.quality.populatedFieldCount} useful fields</div>
                    <div style={{ color: '#8291a7', fontSize: 11 }}>{record.quality.classification}</div>
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #26364d', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(record.retrievedAt)}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #26364d' }}><a href={record.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>Open source ↗</a></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
          <div style={{ padding: 14, borderTop: '1px solid #26364d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))} style={{ padding: '9px 13px', borderRadius: 7, background: '#172033', border: '1px solid #334155', color: 'white' }}>Previous</button>
            <span style={{ color: '#93a4bd', fontSize: 12 }}>Showing up to 25 records</span>
            <button disabled={page >= pageCount || loading} onClick={() => setPage(value => Math.min(pageCount, value + 1))} style={{ padding: '9px 13px', borderRadius: 7, background: '#172033', border: '1px solid #334155', color: 'white' }}>Next</button>
          </div>
        </section>

        <p style={{ color: '#8291a7', fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>
          Data Bank quality indicators measure field completeness only. They do not independently verify a company, prove contactability, grant resale rights, or predict sales. SAM.gov solicitation records are opportunity research, not supplier endorsements or buyer leads. Check each source’s terms before creating a commercial data product.
        </p>
      </div>
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type SupplierRecord = {
  id?: string;
  awardId?: string | null;
  sourceRecordId?: string;
  supplierName?: string | null;
  awardAmount?: string | number | null;
  startDate?: string | null;
  endDate?: string | null;
  awardingAgency?: string | null;
  description?: string | null;
  performanceState?: string | null;
  naics?: string | number | null;
  supplierUei?: string | null;
  sourceUrl?: string;
  retrievedAt?: string;
  payload?: Record<string, unknown>;
};

export default function SupplierResearchPage() {
  const [records, setRecords] = useState<SupplierRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastRetrieved, setLastRetrieved] = useState('');

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('Please sign in first, then return to Supplier Research.');
        return;
      }
      const params = new URLSearchParams({ limit: '100' });
      if (search.trim()) params.set('q', search.trim());
      const response = await fetch(`${API}/research/suppliers/federal-awards/saved?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load saved supplier records.');
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved supplier records.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const fetchLatest = async () => {
    setFetching(true);
    setError('');
    setNotice('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first, then return to Supplier Research.');
      const response = await fetch(`${API}/research/suppliers/federal-awards?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to retrieve federal award data.');
      setLastRetrieved(data.retrievedAt || '');
      setNotice(`Retrieved ${data.count ?? 0} records from USAspending.gov; saved ${data.persistedCount ?? 0} records to the database.`);
      await loadSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to retrieve federal award data.');
    } finally {
      setFetching(false);
    }
  };

  const money = (value: SupplierRecord['awardAmount']) => {
    const amount = typeof value === 'number' ? value : Number(value);
    return value == null || value === '' || !Number.isFinite(amount)
      ? 'Not provided'
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const field = (record: SupplierRecord, key: string): unknown => {
    if (record[key as keyof SupplierRecord] !== undefined) return record[key as keyof SupplierRecord];
    return record.payload?.[key];
  };

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
          <a href="/" style={{ color: '#93c5fd', textDecoration: 'none' }}>← Back to marketplace</a>
          <a href="/dashboard" style={{ color: '#93c5fd', textDecoration: 'none' }}>Dashboard</a>
        </nav>
        <header style={{ marginBottom: 24 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>SUPPLIER INTELLIGENCE</p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', margin: '8px 0 12px' }}>Federal Award Research</h1>
          <p style={{ color: '#a8b6ca', maxWidth: 760, lineHeight: 1.6 }}>
            Retrieve public U.S. federal award records from USAspending.gov, retain source details, and search records saved to your marketplace database.
          </p>
        </header>

        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <button onClick={fetchLatest} disabled={fetching} style={{ border: 0, borderRadius: 8, padding: '12px 16px', background: fetching ? '#475569' : '#2563eb', color: 'white', fontWeight: 700, cursor: fetching ? 'wait' : 'pointer' }}>
            {fetching ? 'Retrieving records…' : 'Fetch latest federal awards'}
          </button>
          <button onClick={() => void loadSaved()} disabled={loading} style={{ border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', background: '#172033', color: '#e5edf8', cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Refreshing…' : 'Refresh saved records'}
          </button>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search supplier name" aria-label="Search supplier name" style={{ flex: '1 1 220px', minWidth: 180, border: '1px solid #334155', borderRadius: 8, padding: '12px', background: '#111a2b', color: '#e5edf8' }} />
        </section>

        {error && <p role="alert" style={{ background: '#451a1a', color: '#fecaca', borderRadius: 8, padding: 12 }}>{error}</p>}
        {notice && <p role="status" style={{ background: '#102d25', color: '#bbf7d0', borderRadius: 8, padding: 12 }}>{notice}</p>}
        {lastRetrieved && <p style={{ color: '#94a3b8', fontSize: 12 }}>Last retrieved: {new Date(lastRetrieved).toLocaleString()}</p>}

        <section style={{ border: '1px solid #253248', borderRadius: 12, overflow: 'hidden', background: '#101a2b' }}>
          <div style={{ padding: 16, borderBottom: '1px solid #253248', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong>Saved supplier records</strong>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>{records.length} shown · up to 100</span>
          </div>
          {loading && records.length === 0 ? <p style={{ padding: 18, color: '#94a3b8' }}>Loading saved records…</p> : records.length === 0 ? (
            <p style={{ padding: 18, color: '#94a3b8' }}>No saved records found. Select “Fetch latest federal awards” to retrieve public data. Database access and the migration must be configured for saving to work.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr style={{ textAlign: 'left', color: '#93a4bd', fontSize: 12 }}>
                  {['Supplier / recipient', 'Award amount', 'Agency', 'State', 'Award ID', 'Source'].map((heading) => <th key={heading} style={{ padding: 12, borderBottom: '1px solid #253248' }}>{heading}</th>)}
                </tr></thead>
                <tbody>
                  {records.map((record, index) => {
                    const name = record.supplierName || String(field(record, 'Recipient Name') || field(record, 'recipient_name') || 'Name not provided');
                    const awardId = record.sourceRecordId || record.awardId || String(field(record, 'Award ID') || field(record, 'award_id') || '');
                    const agency = String(field(record, 'awardingAgency') || field(record, 'Awarding Agency') || field(record, 'awarding_agency_name') || 'Not provided');
                    const state = String(field(record, 'performanceState') || field(record, 'Place of Performance State Code') || field(record, 'place_of_performance_state_code') || '—');
                    const amount = record.awardAmount ?? field(record, 'Award Amount') as SupplierRecord['awardAmount'];
                    return <tr key={record.id || awardId || index}>
                      <td style={{ padding: 12, borderBottom: '1px solid #253248', fontWeight: 600 }}>{name}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #253248', whiteSpace: 'nowrap' }}>{money(amount)}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #253248' }}>{agency}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #253248' }}>{state}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #253248', fontFamily: 'monospace', fontSize: 12 }}>{awardId || '—'}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #253248' }}><a href={record.sourceUrl || 'https://www.usaspending.gov/'} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>USAspending.gov</a></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p style={{ color: '#8291a7', fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>
          These are public award records for research, not independently verified supplier endorsements or guaranteed sales leads. Confirm source records and applicable data-use terms before packaging or selling any dataset.
        </p>
      </div>
    </main>
  );
}

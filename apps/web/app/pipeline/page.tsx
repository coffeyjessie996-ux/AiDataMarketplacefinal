'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';
const stages = ['NEW', 'QUALIFIED', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'];

type Lead = {
  id: string; companyName: string; source: string; sourceRecordId?: string | null;
  email?: string | null; website?: string | null; score: number; stage: string;
  notes?: string | null; nextFollowUpAt?: string | null; updatedAt: string;
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Please sign in first.');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const h = headers();
      const [leadRes, salesRes] = await Promise.all([
        fetch(`${API}/pipeline/leads?q=${encodeURIComponent(query)}`, { headers: h }),
        fetch(`${API}/pipeline/sales`, { headers: h }),
      ]);
      const leadData = await leadRes.json();
      const salesData = await salesRes.json();
      if (!leadRes.ok) throw new Error(leadData.error || 'Could not load leads.');
      if (!salesRes.ok) throw new Error(salesData.error || 'Could not load sales pipeline.');
      setLeads(leadData.leads || []);
      setCounts(salesData.stages || {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load pipeline.'); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const importSuppliers = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch(`${API}/pipeline/leads/import-suppliers`, { method: 'POST', headers: headers(), body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Supplier import failed.');
      setMessage(`Reviewed ${data.recordsReviewed} saved supplier records; ${data.leadsCreatedOrExisting} leads created or already present.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Supplier import failed.'); }
    finally { setBusy(false); }
  };

  const addLead = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch(`${API}/pipeline/leads`, { method: 'POST', headers: headers(), body: JSON.stringify({ companyName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add lead.');
      setCompanyName(''); setMessage('Lead added.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add lead.'); }
    finally { setBusy(false); }
  };

  const changeStage = async (lead: Lead, stage: string) => {
    setError('');
    try {
      const response = await fetch(`${API}/pipeline/leads/${lead.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ stage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update lead stage.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update stage.'); }
  };

  return <main style={{ minHeight: '100vh', padding: 24, background: '#0b1220', color: '#e5edf8' }}>
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <a href="/dashboard" style={{ color: '#93c5fd' }}>← Dashboard</a>
        <a href="/" style={{ color: '#93c5fd' }}>Marketplace</a>
      </nav>
      <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>GROWTH OPERATIONS</p>
      <h1 style={{ fontSize: 36, margin: '8px 0' }}>Lead &amp; Sales Pipeline</h1>
      <p style={{ color: '#a8b6ca' }}>Track sourced suppliers from first discovery through qualification, outreach, proposal, and closed outcome.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, margin: '22px 0' }}>
        {stages.map(stage => <div key={stage} style={{ background: '#111c2e', border: '1px solid #26364d', borderRadius: 10, padding: 14 }}>
          <div style={{ color: '#93a4bd', fontSize: 11 }}>{stage}</div><strong style={{ fontSize: 24 }}>{counts[stage] ?? 0}</strong>
        </div>)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <button onClick={importSuppliers} disabled={busy} style={{ padding: '11px 14px', border: 0, borderRadius: 8, background: '#2563eb', color: 'white' }}>Import saved USAspending suppliers</button>
        <button onClick={() => void load()} style={{ padding: '11px 14px', border: '1px solid #334155', borderRadius: 8, background: '#172033', color: 'white' }}>Refresh</button>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search company" style={{ flex: '1 1 200px', padding: 11, borderRadius: 8, background: '#111a2b', color: 'white', border: '1px solid #334155' }} />
      </div>
      <form onSubmit={addLead} style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Add a company lead" required minLength={2} style={{ flex: 1, padding: 11, borderRadius: 8, background: '#111a2b', color: 'white', border: '1px solid #334155' }} />
        <button disabled={busy} style={{ padding: '11px 16px', border: 0, borderRadius: 8, background: '#0f766e', color: 'white' }}>Add lead</button>
      </form>
      {message && <p role="status" style={{ color: '#bbf7d0' }}>{message}</p>}
      {error && <p role="alert" style={{ color: '#fecaca' }}>{error}</p>}
      <section style={{ border: '1px solid #26364d', borderRadius: 12, overflow: 'hidden', background: '#101a2b' }}>
        <div style={{ padding: 14, borderBottom: '1px solid #26364d' }}>Lead records ({leads.length})</div>
        {leads.length === 0 ? <p style={{ padding: 18, color: '#94a3b8' }}>No leads yet. Fetch federal award records in Supplier Research, then import them here.</p> :
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#93a4bd' }}>{['Company','Source','Priority score','Stage','Follow-up'].map(x => <th key={x} style={{ padding: 12 }}>{x}</th>)}</tr></thead>
            <tbody>{leads.map(lead => <tr key={lead.id}>
              <td style={{ padding: 12, borderTop: '1px solid #26364d' }}><strong>{lead.companyName}</strong><div style={{ fontSize: 12, color: '#93a4bd' }}>{lead.email || lead.website || lead.sourceRecordId || ''}</div></td>
              <td style={{ padding: 12, borderTop: '1px solid #26364d' }}>{lead.source}</td>
              <td style={{ padding: 12, borderTop: '1px solid #26364d' }}>{lead.score}/100</td>
              <td style={{ padding: 12, borderTop: '1px solid #26364d' }}><select value={lead.stage} onChange={e => void changeStage(lead,e.target.value)} style={{ padding: 8, background: '#172033', color: 'white', border: '1px solid #334155', borderRadius: 6 }}>{stages.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
              <td style={{ padding: 12, borderTop: '1px solid #26364d' }}>{lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : 'Not scheduled'}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      <p style={{ color: '#8291a7', fontSize: 12, marginTop: 14 }}>Award-size score is only a sorting hint. It does not verify a supplier, prove purchase intent, create a product listing, or count revenue. Payment and checkout remain separately disabled until verified Stripe processing is implemented.</p>
    </div>
  </main>;
}

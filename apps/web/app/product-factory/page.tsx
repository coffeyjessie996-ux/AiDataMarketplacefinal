'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type ResearchRecord = {
  id: string;
  source: string;
  sourceRecordId: string;
  supplierName: string | null;
  sourceUrl: string;
  retrievedAt: string;
  payload: Record<string, unknown>;
  quality: { populatedFieldCount: number; hasSupplierName: boolean; hasSourceLink: boolean; classification: string };
};

type CreatedProduct = {
  id: string;
  title: string;
  status: string;
  priceCents: number;
  qualityScore: number;
  quality: { recordCount: number; distinctSourceCount: number; sourceLinkRate: number; supplierNameRate: number; fieldCompleteness: number };
  licensing: { status: string; note: string };
  provenance: Array<{ recordId: string; source: string; sourceRecordId: string; sourceUrl: string; retrievedAt: string }>;
};

export default function ProductFactoryPage() {
  const [records, setRecords] = useState<ResearchRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Supplier intelligence');
  const [description, setDescription] = useState('');
  const [product, setProduct] = useState<CreatedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Please sign in to use the Product Factory.');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/data-bank/records?page=1&limit=50`, { headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load saved research records.');
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved research.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setSelected(current => current.includes(id)
    ? current.filter(value => value !== id)
    : current.length >= 50 ? current : [...current, id]);

  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    setProduct(null);
    try {
      const response = await fetch(`${API}/data-bank/products`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ recordIds: selected, title, category, description }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create product draft.');
      setProduct(data.product);
      setNotice('Product draft saved. It is private, unpublished, and not cleared for redistribution.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create product draft.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 26 }}>
          <a href="/dashboard" style={{ color: '#93c5fd' }}>← Dashboard</a>
          <a href="/data-bank" style={{ color: '#93c5fd' }}>AI Data Bank</a>
          <a href="/pipeline" style={{ color: '#93c5fd' }}>Sales pipeline</a>
        </nav>
        <header style={{ marginBottom: 24 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>PRODUCT CREATION WORKSPACE</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', margin: '8px 0 10px' }}>AI Data Product Factory</h1>
          <p style={{ color: '#a8b6ca', maxWidth: 820, lineHeight: 1.6 }}>
            Assemble real records already saved in your Data Bank into a private product draft. Source links and collection dates are retained, and a transparent completeness score is calculated from the records.
          </p>
        </header>

        <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>1. Choose source records</h2>
            <span style={{ color: '#93a4bd', fontSize: 13 }}>{selected.length} selected · maximum 50</span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Only records stored in your connected Data Bank are available here. Selecting a record does not imply that its contents may legally be resold.</p>
          {loading ? <p>Loading research records…</p> : records.length === 0 ? <p style={{ color: '#94a3b8' }}>No saved records are available yet. Collect public research first, then return here.</p> : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 430, overflowY: 'auto' }}>
              {records.map(record => (
                <label key={record.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, border: '1px solid #29384d', borderRadius: 8, background: selected.includes(record.id) ? '#172a40' : '#0e1828' }}>
                  <input type="checkbox" checked={selected.includes(record.id)} onChange={() => toggle(record.id)} disabled={!selected.includes(record.id) && selected.length >= 50} style={{ marginTop: 4, width: 18, height: 18 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong>{record.supplierName || String(record.payload.title || record.sourceRecordId)}</strong>
                    <span style={{ display: 'block', color: '#9fb0c5', fontSize: 12, marginTop: 4 }}>{record.source} · {record.quality.populatedFieldCount} populated fields · collected {new Date(record.retrievedAt).toLocaleDateString()}</span>
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: '#7dd3fc', fontSize: 12, marginTop: 4 }}>Original source</a>
                  </span>
                </label>
              ))}
            </div>
          )}
          <button type="button" onClick={() => void load()} disabled={loading} style={{ marginTop: 12, padding: '9px 12px', borderRadius: 7, background: '#172033', border: '1px solid #334155', color: 'white' }}>Refresh records</button>
        </section>

        <form onSubmit={createDraft} style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>2. Describe the product</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>Product name
              <input required minLength={5} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. US Federal Award Supplier Directory" style={{ padding: 11, borderRadius: 7, background: '#0b1220', color: 'white', border: '1px solid #475569' }} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>Category
              <input required minLength={2} maxLength={80} value={category} onChange={event => setCategory(event.target.value)} style={{ padding: 11, borderRadius: 7, background: '#0b1220', color: 'white', border: '1px solid #475569' }} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, marginTop: 12 }}>Product description
            <textarea required minLength={20} maxLength={2000} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe exactly what the selected records contain, their source, date range, and known limitations. Do not claim verification that has not been performed." style={{ padding: 11, borderRadius: 7, background: '#0b1220', color: 'white', border: '1px solid #475569', resize: 'vertical' }} />
          </label>
          <p style={{ color: '#fbbf24', fontSize: 13, lineHeight: 1.5 }}>New drafts are saved as DRAFT with no price and a restricted license status. They cannot appear in the public marketplace until source rights, redistribution terms, data quality, and pricing are reviewed.</p>
          <button type="submit" disabled={creating || selected.length === 0} style={{ padding: '12px 18px', borderRadius: 8, background: creating || selected.length === 0 ? '#475569' : '#0369a1', color: 'white', border: 0, fontWeight: 700 }}>
            {creating ? 'Building product draft…' : `Create private draft from ${selected.length} records`}
          </button>
        </form>

        {error && <p role="alert" style={{ background: '#451a1a', color: '#fecaca', borderRadius: 8, padding: 12, marginTop: 16 }}>{error}</p>}
        {notice && <p role="status" style={{ background: '#123027', color: '#bbf7d0', borderRadius: 8, padding: 12, marginTop: 16 }}>{notice}</p>}
        {product && (
          <section style={{ marginTop: 18, background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>3. Draft quality and provenance</h2>
            <p><strong>{product.title}</strong> · {product.status.toUpperCase()} · Product ID: {product.id}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
              {[
                ['Quality score', `${product.qualityScore}/100`],
                ['Source records', String(product.quality.recordCount)],
                ['Distinct sources', String(product.quality.distinctSourceCount)],
                ['Source links', `${product.quality.sourceLinkRate}%`],
                ['Supplier names', `${product.quality.supplierNameRate}%`],
                ['Field completeness', `${product.quality.fieldCompleteness}%`],
              ].map(([label, value]) => <div key={label} style={{ background: '#17263a', padding: 12, borderRadius: 8 }}><span style={{ display: 'block', color: '#93a4bd', fontSize: 12 }}>{label}</span><strong style={{ fontSize: 20 }}>{value}</strong></div>)}
            </div>
            <h3>Source trail</h3>
            <ul>{product.provenance.map(item => <li key={item.recordId} style={{ marginBottom: 8 }}>{item.source} · {item.sourceRecordId} · {new Date(item.retrievedAt).toLocaleString()} · <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>Original record</a></li>)}</ul>
            <p style={{ color: '#fbbf24', fontSize: 13 }}>{product.licensing.note}</p>
          </section>
        )}
      </div>
    </main>
  );
}

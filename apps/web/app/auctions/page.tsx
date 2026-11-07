'use client';

import { FormEvent, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';
type Auction = {
  id: string;
  dataset: { id: string; title: string; category: string; description: string; qualityScore: number; licenseType: string };
  startingBidCents: number;
  currentBidCents: number | null;
  minimumIncrementCents: number;
  bidCount: number;
  closesAt: string;
};
type Dataset = { id: string; title: string; status: string; licenseType: string };

const money = (cents: number | null) => cents === null ? 'No bids yet' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const localDateTime = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [role, setRole] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [startingBid, setStartingBid] = useState('25');
  const [closesAt, setClosesAt] = useState(localDateTime());

  async function loadAuctions() {
    const response = await fetch(`${API}/auctions`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load auctions.');
    setAuctions(data.auctions || []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadAuctions();
        const savedToken = window.localStorage.getItem('auth_token') || '';
        if (savedToken) {
          const headers = { Authorization: `Bearer ${savedToken}` };
          const [meResponse, datasetResponse] = await Promise.all([
            fetch(`${API}/auth/me`, { headers, cache: 'no-store' }),
            fetch(`${API}/dashboard/datasets`, { headers, cache: 'no-store' }),
          ]);
          if (meResponse.ok && datasetResponse.ok) {
            const me = await meResponse.json();
            const data = await datasetResponse.json();
            if (active) {
              setToken(savedToken);
              setRole(me.user?.role || '');
              setDatasets((data.datasets || []).filter((item: Dataset) => item.status === 'published' && item.licenseType !== 'restricted'));
            }
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load the auction center.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function createAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API}/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          datasetId,
          startingBidCents: Math.round(Number(startingBid) * 100),
          closesAt: new Date(closesAt).toISOString(),
          rightsConfirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not create auction. Check your listing and try again.');
      setNotice('Auction is live. Buyers can now submit offers.');
      await loadAuctions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create auction.');
    }
  }

  async function placeBid(event: FormEvent<HTMLFormElement>, auction: Auction) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!token) { setError('Please sign in to place a bid.'); return; }
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    try {
      const response = await fetch(`${API}/auctions/${auction.id}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountCents: Math.round(amount * 100) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not record your offer.');
      setNotice('Your offer was recorded. It is not a purchase and no payment was taken.');
      await loadAuctions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place bid.');
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', color: 'var(--foreground, #f8fafc)' }}>
      <a href="/" style={{ color: 'inherit' }}>← Marketplace</a>
      <header style={{ margin: '28px 0' }}>
        <p style={{ letterSpacing: 2, fontSize: 12, opacity: .7 }}>AI DATA MARKETPLACE</p>
        <h1 style={{ fontSize: 36, margin: '8px 0' }}>Data Auction Center</h1>
        <p style={{ maxWidth: 720, opacity: .8 }}>Discover published data products and submit competitive offers. Sellers can auction eligible published datasets.</p>
      </header>

      {notice && <p role="status" style={{ padding: 12, border: '1px solid #16a34a', borderRadius: 8 }}>{notice}</p>}
      {error && <p role="alert" style={{ padding: 12, border: '1px solid #dc2626', borderRadius: 8 }}>{error}</p>}

      {['seller', 'admin'].includes(role) && token && (
        <section style={{ padding: 20, border: '1px solid #475569', borderRadius: 12, marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, marginTop: 0 }}>List a dataset for bids</h2>
          <form onSubmit={createAuction} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', alignItems: 'end' }}>
            <label>Published dataset
              <select required value={datasetId} onChange={e => setDatasetId(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, color: '#111827' }}>
                <option value="">Choose your dataset</option>
                {datasets.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <label>Starting bid (USD)
              <input required type="number" min="0.01" step="0.01" value={startingBid} onChange={e => setStartingBid(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }} />
            </label>
            <label>Closes at
              <input required type="datetime-local" min={localDateTime()} value={closesAt} onChange={e => setClosesAt(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }} />
            </label>
            <button type="submit" disabled={!datasetId} style={{ padding: 12, borderRadius: 8, border: 0, cursor: 'pointer' }}>Create auction</button>
          </form>
          <p style={{ fontSize: 12, opacity: .7 }}>You must own the dataset and confirm that you have the legal right to license its contents. Restricted datasets cannot be auctioned. Auctions close within 30 days.</p>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 24 }}>Open auctions</h2>
        {loading ? <p>Loading active auctions…</p> : auctions.length === 0 ? (
          <p style={{ padding: 24, border: '1px dashed #64748b', borderRadius: 12 }}>No active auctions yet. Eligible published datasets can be listed by their sellers.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {auctions.map(auction => (
              <article key={auction.id} style={{ padding: 18, border: '1px solid #475569', borderRadius: 12, display: 'grid', gap: 10 }}>
                <span style={{ fontSize: 12, opacity: .7 }}>{auction.dataset.category} · Quality completeness {auction.dataset.qualityScore}/100</span>
                <h3 style={{ fontSize: 19, margin: 0 }}>{auction.dataset.title}</h3>
                <p style={{ opacity: .8, margin: 0 }}>{auction.dataset.description}</p>
                <div><strong>Current offer:</strong> {money(auction.currentBidCents)}</div>
                <div><strong>Starting bid:</strong> {money(auction.startingBidCents)}</div>
                <div><strong>Offers:</strong> {auction.bidCount}</div>
                <div><strong>Closes:</strong> {new Date(auction.closesAt).toLocaleString()}</div>
                <form onSubmit={event => placeBid(event, auction)} style={{ display: 'flex', gap: 8 }}>
                  <input name="amount" required type="number" min={((auction.currentBidCents ?? auction.startingBidCents - auction.minimumIncrementCents) + auction.minimumIncrementCents) / 100} step="0.01" placeholder="Your offer ($)" style={{ minWidth: 0, flex: 1, padding: 10 }} />
                  <button type="submit" style={{ padding: '10px 14px', borderRadius: 8, border: 0 }}>Offer</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
      <p style={{ marginTop: 28, fontSize: 13, opacity: .7 }}>Important: offers are recorded for seller review only. They do not create an order, transfer ownership, or charge a payment method. Payment and automatic settlement are not enabled.</p>
    </main>
  );
}

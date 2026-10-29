'use client';

import { useEffect, useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'buyer' | 'seller' | 'admin';
};

type Dataset = {
  id: string;
  title: string;
  category: string;
  priceCents: number;
  qualityScore: number;
  status: string;
  tags: string[];
};

type Wallet = {
  id: string;
  balanceCents: number;
  currency: string;
};

type DashboardOverview = {
  source: string;
  updatedAt: string;
  role: string;
  testAccount: boolean;
  paymentProcessingEnabled: boolean;
  snapshot: {
    walletBalanceCents: number;
    totalDatasets: number;
    publishedDatasets: number;
    recordedPaidOrderValueCents: number;
    paidOrders: number;
    pendingPayouts: number;
    supplierResearchRecords: number;
    latestSupplierRetrievedAt: string | null;
    userCount: number | null;
  };
  recentOrders: Array<{
    id: string;
    datasetTitle: string;
    totalCents: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  recentSupplierRecords: Array<{
    id: string;
    source: string;
    supplierName: string | null;
    awardAmount: string | null;
    sourceUrl: string;
    retrievedAt: string;
  }>;
};

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setError('Please sign in to view the dashboard.');
          return;
        }
        const meRes = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const data = await meRes.json();
          setUser(data.user);
          setWallet(data.wallet);
        } else if (meRes.status === 401) {
          localStorage.removeItem('auth_token');
          setError('Your session has expired. Please sign in again.');
        } else {
          setError('Unable to load your account. Please try again.');
        }
      } catch (error) {
        console.error('Failed to fetch user', error);
        setError('Failed to reach the API. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const formatMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const userInitial = user?.name?.charAt(0).toUpperCase() || 'U';

  if (loading || error || !user) {
    return (
      <div className="dashboard-layout">
        <main className="dashboard-main">
          <div className="card empty-state">
            <p>{loading ? 'Loading...' : error ?? 'Unable to load your account.'}</p>
            {!loading && (
              <a href="/" className="primary-button">
                Back to home
              </a>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">AIDATA</div>

        <div className="nav-group">
          <div className="nav-group-label">Marketplace</div>
          <a className="nav-item" href="/">🛍️ Browse marketplace</a>
          <a className="nav-item" href="/suppliers">🔎 Supplier research</a>
        </div>

        <div className="nav-group">
          <div className="nav-group-label">Main</div>
          <a
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📊 Overview
          </a>
          {user?.role === 'seller' && (
            <a
              className={`nav-item ${activeTab === 'datasets' ? 'active' : ''}`}
              onClick={() => setActiveTab('datasets')}
            >
              📦 My datasets
            </a>
          )}
          {user?.role === 'buyer' && (
            <a
              className={`nav-item ${activeTab === 'purchases' ? 'active' : ''}`}
              onClick={() => setActiveTab('purchases')}
            >
              🛒 Purchases
            </a>
          )}
        </div>

        <div className="nav-group">
          <div className="nav-group-label">Finance</div>
          <a
            className={`nav-item ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet')}
          >
            💰 Wallet
          </a>
          <a
            className={`nav-item ${activeTab === 'payouts' ? 'active' : ''}`}
            onClick={() => setActiveTab('payouts')}
          >
            🏦 Payouts
          </a>
        </div>

        {user?.role === 'admin' && (
          <div className="nav-group">
            <div className="nav-group-label">Admin</div>
            <a
              className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              ⚙️ Platform
            </a>
          </div>
        )}
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-topbar">
          <h1>Dashboard</h1>
          <div className="user-profile">
            <div className="user-avatar">{userInitial}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{user?.role}</div>
            </div>
          </div>
        </div>

        {activeTab === 'overview' && <OverviewTab user={user} wallet={wallet} formatMoney={formatMoney} />}
        {activeTab === 'datasets' && user?.role === 'seller' && <DatasetsTab formatMoney={formatMoney} />}
        {activeTab === 'purchases' && user?.role === 'buyer' && <PurchasesTab formatMoney={formatMoney} />}
        {activeTab === 'wallet' && <WalletTab user={user} wallet={wallet} formatMoney={formatMoney} />}
        {activeTab === 'payouts' && <PayoutsTab formatMoney={formatMoney} />}
        {activeTab === 'admin' && user?.role === 'admin' && <AdminTab formatMoney={formatMoney} />}
      </main>
    </div>
  );
}

function OverviewTab({ user, wallet, formatMoney }: { user?: User | null; wallet?: Wallet | null; formatMoney: (cents: number) => string }) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API}/dashboard/overview`, {
          headers: { Authorization: `Bearer ${token || ''}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Could not load live dashboard data.');
        }
        if (!cancelled) {
          setOverview(data as DashboardOverview);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load live dashboard data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const snapshot = overview?.snapshot;
  const isAdmin = user?.role === 'admin';
  const isSeller = user?.role === 'seller';
  const orderValueLabel = isAdmin
    ? 'Recorded paid order value'
    : isSeller
      ? 'Paid order value for your datasets'
      : 'Your recorded paid spend';

  return (
    <div className="live-dashboard">
      <section className="live-welcome">
        <div>
          <div className="live-kicker">AI DATA MARKETPLACE / OPERATIONS</div>
          <h2>Welcome back, {user?.name || 'there'}</h2>
          <p>Live marketplace activity, supplier intelligence, and account figures from the connected database.</p>
        </div>
        <div className="live-welcome-side">
          <span className={overview ? 'live-status live-status-on' : 'live-status'}>
            <span className="live-status-dot" />
            {loading ? 'Connecting to database' : overview ? 'Live database data' : 'Data unavailable'}
          </span>
          <span className="live-role">{user?.role || 'account'}</span>
        </div>
      </section>

      {overview?.testAccount && (
        <div className="live-warning">
          <strong>This is a test account.</strong>
          <span>Local-only seeded wallet amounts and demo orders are excluded from live figures.</span>
        </div>
      )}
      {error && (
        <div className="live-warning" role="alert">
          <strong>Dashboard data could not be loaded.</strong>
          <span>{error}</span>
          <span>No sample figures are being substituted.</span>
        </div>
      )}

      <div className="live-metric-grid">
        <article className="live-metric-card live-metric-featured">
          <div className="live-metric-label">Wallet ledger balance</div>
          <div className="live-metric-value">{loading ? '—' : formatMoney(snapshot?.walletBalanceCents ?? wallet?.balanceCents ?? 0)}</div>
          <div className="live-metric-caption">Application ledger only; payout processing is disabled.</div>
        </article>
        <article className="live-metric-card">
          <div className="live-metric-label">{orderValueLabel}</div>
          <div className="live-metric-value">{loading ? '—' : formatMoney(snapshot?.recordedPaidOrderValueCents ?? 0)}</div>
          <div className="live-metric-caption">Sum of database orders marked paid; not payment-provider settlement proof.</div>
        </article>
        <article className="live-metric-card">
          <div className="live-metric-label">{isSeller ? 'Your published datasets' : 'Published datasets'}</div>
          <div className="live-metric-value">{loading ? '—' : (snapshot?.publishedDatasets ?? 0).toLocaleString('en-US')}</div>
          <div className="live-metric-caption">Published records currently stored in the database.</div>
        </article>
        <article className="live-metric-card">
          <div className="live-metric-label">Paid orders recorded</div>
          <div className="live-metric-value">{loading ? '—' : (snapshot?.paidOrders ?? 0).toLocaleString('en-US')}</div>
          <div className="live-metric-caption">Database order status, scoped to your role.</div>
        </article>
        <article className="live-metric-card">
          <div className="live-metric-label">Supplier intelligence records</div>
          <div className="live-metric-value">{loading ? '—' : (snapshot?.supplierResearchRecords ?? 0).toLocaleString('en-US')}</div>
          <div className="live-metric-caption">Records saved from the connected public-source research flow.</div>
        </article>
        <article className="live-metric-card">
          <div className="live-metric-label">Pending payout requests</div>
          <div className="live-metric-value">{loading ? '—' : (snapshot?.pendingPayouts ?? 0).toLocaleString('en-US')}</div>
          <div className="live-metric-caption">Requests awaiting review; not a promise that a transfer will occur.</div>
        </article>
        {isAdmin && snapshot?.userCount !== null && snapshot?.userCount !== undefined && (
          <article className="live-metric-card">
            <div className="live-metric-label">Registered accounts</div>
            <div className="live-metric-value">{loading ? '—' : snapshot.userCount.toLocaleString('en-US')}</div>
            <div className="live-metric-caption">Users stored in the database.</div>
          </article>
        )}
      </div>

      <div className="live-insights-grid">
        <section className="live-panel">
          <div className="live-panel-heading">
            <div>
              <div className="live-kicker">MARKET ACTIVITY</div>
              <h3>Recent paid orders</h3>
            </div>
            <span className="live-panel-count">{loading ? '—' : (overview?.recentOrders.length ?? 0)}</span>
          </div>
          {loading ? (
            <p className="live-empty">Loading saved orders…</p>
          ) : overview?.recentOrders.length ? (
            <div className="live-table-wrap">
              <table className="live-table">
                <thead><tr><th>Dataset</th><th>Date</th><th>Recorded total</th></tr></thead>
                <tbody>
                  {overview.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.datasetTitle}</td>
                      <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td>{formatMoney(order.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="live-empty">No paid orders are recorded for this view yet. Nothing is invented or filled with demo sales.</p>
          )}
        </section>

        <section className="live-panel">
          <div className="live-panel-heading">
            <div>
              <div className="live-kicker">SUPPLIER INTELLIGENCE</div>
              <h3>Latest saved records</h3>
            </div>
            <a className="live-text-link" href="/suppliers">Open research ↗</a>
          </div>
          {loading ? (
            <p className="live-empty">Loading saved supplier records…</p>
          ) : overview?.recentSupplierRecords.length ? (
            <div className="live-supplier-list">
              {overview.recentSupplierRecords.map((record) => (
                <article className="live-supplier-row" key={record.id}>
                  <div className="live-supplier-main">
                    <strong>{record.supplierName || 'Supplier name not provided'}</strong>
                    <span>{record.source} · {new Date(record.retrievedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="live-supplier-side">
                    <strong>{record.awardAmount ? `$${Number(record.awardAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}</strong>
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="live-empty">No supplier-research records have been saved yet. Use Supplier research to retrieve public-source records.</p>
          )}
        </section>
      </div>

      <div className="live-footer-note">
        <strong>Data integrity:</strong> values on this screen are queried from stored database records. Checkout and payouts remain disabled until a verified payment-provider integration is enabled.
        {overview?.updatedAt && <span> Last refreshed {new Date(overview.updatedAt).toLocaleString()}.</span>}
        {overview?.snapshot.latestSupplierRetrievedAt && <span> Latest supplier record retrieved {new Date(overview.snapshot.latestSupplierRetrievedAt).toLocaleString()}.</span>}
      </div>
    </div>
  );
}

function DatasetsTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API}/dashboard/datasets`, {
          headers: { Authorization: `Bearer ${token || ''}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Unable to load datasets.');
        if (!cancelled) setDatasets(Array.isArray(data.datasets) ? data.datasets : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load datasets.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <h2 className="card-title" style={{ marginBottom: '6px' }}>My datasets</h2>
          <p style={{ margin: 0, color: '#94a3b8' }}>Records owned by your account, loaded from the database.</p>
        </div>
        <a href="/suppliers" className="secondary-button">Supplier research</a>
      </div>
      {error && <p role="alert" style={{ color: '#fbbf24' }}>{error}</p>}
      {loading ? (
        <p className="live-empty">Loading your dataset records…</p>
      ) : datasets.length === 0 ? (
        <p className="live-empty">No dataset records are stored for this account yet. No sample listings are being substituted.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Title</th><th>Category</th><th>Price</th><th>Quality</th><th>Status</th></tr></thead>
            <tbody>
              {datasets.map((dataset) => (
                <tr key={dataset.id}>
                  <td style={{ fontWeight: 600 }}>{dataset.title}</td>
                  <td>{dataset.category}</td>
                  <td>{formatMoney(dataset.priceCents)}</td>
                  <td>{dataset.qualityScore}/100</td>
                  <td><span className={`badge ${dataset.status.toLowerCase()}`}>{dataset.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PurchasesTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  const [orders, setOrders] = useState<Array<{ id: string; datasetTitle: string; totalCents: number; currency: string; status: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API}/dashboard/orders`, {
          headers: { Authorization: `Bearer ${token || ''}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Unable to load purchases.');
        if (!cancelled) setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load purchases.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card">
      <h2 className="card-title">Purchase history</h2>
      <p style={{ color: '#94a3b8', marginTop: '-8px' }}>Order records saved for your account. A database status does not independently confirm processor settlement.</p>
      {error && <p role="alert" style={{ color: '#fbbf24' }}>{error}</p>}
      {loading ? (
        <p className="live-empty">Loading saved purchases…</p>
      ) : orders.length === 0 ? (
        <p className="live-empty">No purchase records are stored for this account yet.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Dataset</th><th>Date</th><th>Recorded total</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.datasetTitle}</td>
                  <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td>{formatMoney(order.totalCents)}</td>
                  <td><span className={`badge ${order.status.toLowerCase()}`}>{order.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WalletTab({ user, wallet, formatMoney }: { user?: User | null; wallet?: Wallet | null; formatMoney: (cents: number) => string }) {
  const [amountToWithdraw, setAmountToWithdraw] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [payoutMessage, setPayoutMessage] = useState('');

  const handleWithdraw = async () => {
    if (!amountToWithdraw || !bankAccount) {
      setPayoutMessage('Enter an amount and destination details.');
      return;
    }
    setPayoutMessage('');
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API}/wallet/payout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amountCents: Math.round(parseFloat(amountToWithdraw) * 100),
          method: 'bank_transfer',
          destinationAccount: bankAccount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPayoutMessage(data.error || 'Payouts are not enabled until a verified payout provider is connected.');
        return;
      }
      setPayoutMessage('Payout request submitted. This is not a completed transfer.');
      setAmountToWithdraw('');
      setBankAccount('');
    } catch (error) {
      console.error('Failed to request payout', error);
      setPayoutMessage('Could not reach the payout service. No transfer has been confirmed.');
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 className="card-title">Wallet balance</h2>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
          {formatMoney(wallet?.balanceCents || 0)}
        </div>
        <p style={{ color: '#94a3b8', margin: 0 }}>Ledger balance only. Cashouts are disabled until a payout provider is connected.</p>
      </div>

      <div className="card">
        <h2 className="card-title">Request payout</h2>
        <div className="form-group">
          <label>Amount (USD)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amountToWithdraw}
            onChange={(e) => setAmountToWithdraw(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Bank account</label>
          <input
            type="text"
            placeholder="**** 1234"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
          />
        </div>
        <button className="primary-button" onClick={handleWithdraw}>
          Request payout
        </button>
        {payoutMessage && <p role="status" style={{ color: '#94a3b8' }}>{payoutMessage}</p>}
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>A request does not mean money has been transferred. Payouts require a verified provider integration.</p>
      </div>
    </div>
  );
}

function PayoutsTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API}/dashboard/payouts`, {
          headers: { Authorization: `Bearer ${token || ''}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Unable to load payout requests.');
        if (!cancelled) setPayouts(Array.isArray(data.payouts) ? data.payouts : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load payout requests.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card">
      <h2 className="card-title">Payout request history</h2>
      <p style={{ color: '#94a3b8', marginTop: '-8px' }}>Stored payout requests only. A request is not a completed bank transfer.</p>
      {error && <p role="alert" style={{ color: '#fbbf24' }}>{error}</p>}
      {loading ? (
        <p className="live-empty">Loading payout requests…</p>
      ) : payouts.length === 0 ? (
        <p className="live-empty">No payout requests are stored for this account. The payout provider is currently disabled, so transfers cannot be processed.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Requested</th><th>Amount</th><th>Method</th><th>Destination</th><th>Status</th></tr></thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td>{new Date(payout.requestedAt).toLocaleDateString()}</td>
                  <td>{formatMoney(payout.amountCents)}</td>
                  <td>{payout.method}</td>
                  <td>{payout.destinationAccount}</td>
                  <td><span className={`badge ${payout.status.toLowerCase()}`}>{payout.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  const [overview, setOverview] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
const [scraping, setScraping] = useState(false);
const [scraperMessage, setScraperMessage] = useState('');

const startScrapers = async () => {
  setScraping(true);
  setScraperMessage('');

  try {
    const token = localStorage.getItem('auth_token');

    const res = await fetch(`${API}/scrapers/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        urls: [
          'https://www.usa.gov/',
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Scraper failed.');
    }

    setScraperMessage(`Scraped ${data.count} source(s) successfully.`);
  } catch (error) {
    setScraperMessage(
      error instanceof Error ? error.message : 'Scraper failed.'
    );
  } finally {
    setScraping(false);
  }
};
  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API}/admin/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOverview(data.snapshot);
          setOrders(data.orders || []);
        }
      } catch (error) {
        console.error('Failed to fetch admin data', error);
      }
    };
    load();
  }, []);

  return (
    <div>
      <div className="metric-grid"><div style={{ marginTop: '24px' }}>
  <button
    type="button"
    onClick={startScrapers}
    disabled={scraping}
  >
    {scraping ? 'Scraping...' : 'Start Scrapers'}
  </button>

  {scraperMessage && (
    <p>{scraperMessage}</p>
  )}
</div>
        <div className="metric-box">
          <div className="metric-label">Recorded paid order value</div>
          <div className="metric-value">{formatMoney(overview?.totalRevenueCents || 0)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Dataset records</div>
          <div className="metric-value">{overview?.totalDatasets || 0}</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Paid orders recorded</div>
          <div className="metric-value">{overview?.activeOrders || 0}</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Pending payouts</div>
          <div className="metric-value">{overview?.pendingPayouts || 0}</div>
        </div>
      </div>

      <p className="live-footer-note" style={{ marginTop: '16px' }}>
        <strong>Note:</strong> order totals are database records marked paid; they do not confirm settlement by a payment provider. Checkout and payout processing are disabled in this build.
      </p>
      <div className="card" style={{ marginTop: '24px' }}>
        <h2 className="card-title">Recent order records</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Buyer ID</th>
                <th>Dataset ID</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: any) => (
                <tr key={order.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{order.id.slice(0, 8)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{order.buyerId.slice(0, 8)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{order.datasetId.slice(0, 8)}</td>
                  <td>{formatMoney(order.totalCents)}</td>
                  <td>
                    <span className={`badge ${order.status.toLowerCase()}`}>{order.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
  const [overview, setOverview] = useState<any>(null);

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
        }
      } catch (error) {
        console.error('Failed to fetch overview', error);
      }
    };
    load();
  }, []);

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-box">
          <div className="metric-label">Wallet balance</div>
          <div className="metric-value">{formatMoney(wallet?.balanceCents || 0)}</div>
          <div className="metric-trend">Ready to withdraw</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Platform revenue</div>
          <div className="metric-value">{formatMoney(overview?.totalRevenueCents || 0)}</div>
          <div className="metric-trend">All-time</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Active datasets</div>
          <div className="metric-value">{overview?.totalDatasets || 0}</div>
          <div className="metric-trend">Published</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Completed orders</div>
          <div className="metric-value">{overview?.activeOrders || 0}</div>
          <div className="metric-trend">Paid sales</div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Quick actions</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {user?.role === 'seller' && <button className="primary-button">Publish dataset</button>}
          {user?.role === 'buyer' && <button className="primary-button">Browse catalog</button>}
          <button className="secondary-button">View account</button>
        </div>
      </div>
    </div>
  );
}

function DatasetsTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/datasets`);
        if (res.ok) {
          const data = await res.json();
          setDatasets(data.datasets || []);
        }
      } catch (error) {
        console.error('Failed to fetch datasets', error);
      }
    };
    load();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>My datasets</h2>
        <button className="primary-button">Create dataset</button>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Price</th>
                <th>Quality</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => (
                <tr key={dataset.id}>
                  <td style={{ fontWeight: 600 }}>{dataset.title}</td>
                  <td>{dataset.category}</td>
                  <td>{formatMoney(dataset.priceCents)}</td>
                  <td>{dataset.qualityScore}/100</td>
                  <td>
                    <span className={`badge ${dataset.status.toLowerCase()}`}>{dataset.status}</span>
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

function PurchasesTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  return (
    <div className="card">
      <h2 className="card-title">Your purchases</h2>
      <p style={{ color: '#94a3b8' }}>No purchases yet. Visit the marketplace to buy datasets.</p>
    </div>
  );
}

function WalletTab({ user, wallet, formatMoney }: { user?: User | null; wallet?: Wallet | null; formatMoney: (cents: number) => string }) {
  const [amountToWithdraw, setAmountToWithdraw] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  const handleWithdraw = async () => {
    if (!amountToWithdraw || !bankAccount) return;
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
      if (res.ok) {
        alert('Payout requested successfully!');
        setAmountToWithdraw('');
        setBankAccount('');
      }
    } catch (error) {
      console.error('Failed to request payout', error);
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 className="card-title">Wallet balance</h2>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
          {formatMoney(wallet?.balanceCents || 0)}
        </div>
        <p style={{ color: '#94a3b8', margin: 0 }}>Available to withdraw</p>
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
      </div>
    </div>
  );
}

function PayoutsTab({ formatMoney }: { formatMoney: (cents: number) => string }) {
  const [payouts, setPayouts] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API}/admin/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPayouts(data.payouts || []);
        }
      } catch (error) {
        console.error('Failed to fetch payouts', error);
      }
    };
    load();
  }, []);

  return (
    <div className="card">
      <h2 className="card-title">Payout history</h2>
      {payouts.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No payouts yet.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Account</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout: any) => (
                <tr key={payout.id}>
                  <td>{new Date(payout.requestedAt).toLocaleDateString()}</td>
                  <td>{formatMoney(payout.amountCents)}</td>
                  <td>{payout.method}</td>
                  <td>{payout.destinationAccount}</td>
                  <td>
                    <span className={`badge ${payout.status.toLowerCase()}`}>{payout.status}</span>
                  </td>
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
          <div className="metric-label">Total revenue</div>
          <div className="metric-value">{formatMoney(overview?.totalRevenueCents || 0)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Active datasets</div>
          <div className="metric-value">{overview?.totalDatasets || 0}</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Completed orders</div>
          <div className="metric-value">{overview?.activeOrders || 0}</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Pending payouts</div>
          <div className="metric-value">{overview?.pendingPayouts || 0}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h2 className="card-title">Recent orders</h2>
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

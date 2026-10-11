'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Snapshot = {
  totalRevenueCents: number;
  totalDatasets: number;
  activeOrders: number;
  pendingPayouts: number;
  platformLiquidityCents: number;
};

type DatasetRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  priceCents: number;
  qualityScore: number;
};

type PayoutRow = {
  id: string;
  amountCents: number;
  destinationAccount: string;
  status: string;
};

const fallbackSnapshot: Snapshot = {
  totalRevenueCents: 245000,
  totalDatasets: 12,
  activeOrders: 38,
  pendingPayouts: 5,
  platformLiquidityCents: 118500,
};

const fallbackDatasets: DatasetRow[] = [
  { id: 'd1', title: 'Fintech Signals', category: 'Finance', status: 'published', priceCents: 6900, qualityScore: 96 },
  { id: 'd2', title: 'SaaS Buyer Leads', category: 'B2B', status: 'published', priceCents: 5400, qualityScore: 92 },
  { id: 'd3', title: 'Startup Hiring Trends', category: 'Market Research', status: 'review', priceCents: 7800, qualityScore: 88 },
  { id: 'd4', title: 'E-commerce Inventory Index', category: 'Retail', status: 'draft', priceCents: 3200, qualityScore: 77 },
];

const fallbackPayouts: PayoutRow[] = [
  { id: 'p1', amountCents: 24000, destinationAccount: '**** 4821', status: 'requested' },
  { id: 'p2', amountCents: 16500, destinationAccount: '**** 2014', status: 'processing' },
  { id: 'p3', amountCents: 9000, destinationAccount: '**** 6312', status: 'approved' },
];

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>(fallbackSnapshot);
  const [datasets, setDatasets] = useState<DatasetRow[]>(fallbackDatasets);
  const [payouts, setPayouts] = useState<PayoutRow[]>(fallbackPayouts);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<'ready' | 'unauthenticated' | 'error'>('ready');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const token = window.localStorage.getItem('auth_token');

        if (!token) {
          setAuthState('unauthenticated');
          setLoading(false);
          return;
        }

        const response = await fetch(`${API}/admin/overview`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          setAuthState('error');
          setLoading(false);
          return;
        }

        const json = await response.json();
        const nextSnapshot = json.snapshot ?? fallbackSnapshot;

        setSnapshot({
          ...fallbackSnapshot,
          ...nextSnapshot,
        });
        setDatasets(json.datasets ?? fallbackDatasets);
        setPayouts(json.payouts ?? fallbackPayouts);
        setAuthState('ready');
      } catch (error) {
        console.error('Failed to load dashboard data', error);
        setAuthState('error');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const formatMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">AIDATA</div>

        <div className="nav-group">
          <div className="nav-group-label">Overview</div>
          <div className="nav-item active">Dashboard</div>
          <div className="nav-item">Catalog</div>
          <div className="nav-item">Orders</div>
          <div className="nav-item">Payouts</div>
        </div>

        <div className="nav-group">
          <div className="nav-group-label">Operations</div>
          <div className="nav-item">Data sources</div>
          <div className="nav-item">Quality checks</div>
          <div className="nav-item">Pricing</div>
        </div>
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-topbar">
          <h1>Marketplace dashboard</h1>
          <div className="user-profile">
            <div className="user-avatar">A</div>
            <div className="user-name">Admin view</div>
          </div>
        </div>

        {loading ? (
          <div className="card empty-state">
            <p>Loading marketplace analytics...</p>
          </div>
        ) : (
          <>
            {authState !== 'ready' && (
              <div className="card" style={{ marginBottom: 24 }}>
                <h3 className="card-title">
                  {authState === 'unauthenticated' ? 'Demo mode active' : 'Unable to load live admin data'}
                </h3>
                <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {authState === 'unauthenticated'
                    ? 'Sign in with an admin account to access live revenue and payout data.'
                    : 'The API rejected the request. Check the auth token and admin permissions.'}
                </p>
              </div>
            )}

            <section className="metric-grid">
              <div className="metric-box">
                <div className="metric-label">Gross revenue</div>
                <div className="metric-value">{formatMoney(snapshot.totalRevenueCents)}</div>
                <div className="metric-trend">+12.4% vs last month</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Datasets</div>
                <div className="metric-value">{snapshot.totalDatasets}</div>
                <div className="metric-trend">+3 new listings</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Active orders</div>
                <div className="metric-value">{snapshot.activeOrders}</div>
                <div className="metric-trend">18 require attention</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Platform liquidity</div>
                <div className="metric-value">{formatMoney(snapshot.platformLiquidityCents)}</div>
                <div className="metric-trend">{snapshot.pendingPayouts} pending payouts</div>
              </div>
            </section>

            <div className="card" style={{ marginBottom: 24 }}>
              <h3 className="card-title">Dataset performance</h3>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Dataset</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Quality</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasets.map((dataset) => (
                      <tr key={dataset.id}>
                        <td>{dataset.title}</td>
                        <td>{dataset.category}</td>
                        <td>
                          <span className={`badge ${dataset.status === 'published' ? 'active' : dataset.status === 'review' ? 'pending' : 'paid'}`}>
                            {dataset.status}
                          </span>
                        </td>
                        <td>{dataset.qualityScore}/100</td>
                        <td>{formatMoney(dataset.priceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Recent payouts</h3>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Amount</th>
                      <th>Destination</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr key={payout.id}>
                        <td>{payout.id}</td>
                        <td>{formatMoney(payout.amountCents)}</td>
                        <td>{payout.destinationAccount}</td>
                        <td>
                          <span className={`badge ${payout.status === 'approved' || payout.status === 'completed' ? 'active' : payout.status === 'processing' ? 'pending' : 'paid'}`}>
                            {payout.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

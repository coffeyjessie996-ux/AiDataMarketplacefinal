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

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const token = window.localStorage.getItem('auth_token');

        if (!token) {
          setError('Please sign in to view the dashboard.');
          setLoading(false);
          return;
        }

        const response = await fetch(`${API}/admin/overview`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          setError('Unable to load dashboard data. Check your permissions.');
          setLoading(false);
          return;
        }

        const json = await response.json();
        setSnapshot(json.snapshot ?? null);
        setDatasets(json.datasets ?? []);
        setPayouts(json.payouts ?? []);
        setError(null);
      } catch (error) {
        console.error('Failed to load dashboard data', error);
        setError('Failed to load dashboard. Please try again.');
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
        ) : error ? (
          <div className="card empty-state">
            <p>{error}</p>
          </div>
        ) : (
          <>
            {snapshot && (
              <section className="metric-grid">
                <div className="metric-box">
                  <div className="metric-label">Gross revenue</div>
                  <div className="metric-value">{formatMoney(snapshot.totalRevenueCents)}</div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">Datasets</div>
                  <div className="metric-value">{snapshot.totalDatasets}</div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">Active orders</div>
                  <div className="metric-value">{snapshot.activeOrders}</div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">Platform liquidity</div>
                  <div className="metric-value">{formatMoney(snapshot.platformLiquidityCents)}</div>
                </div>
              </section>
            )}

            {datasets.length > 0 && (
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
            )}

            {payouts.length > 0 && (
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
            )}
          </>
        )}
      </main>
    </div>
  );
}

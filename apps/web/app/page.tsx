'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Dataset = {
  id: string;
  title: string;
  category: string;
  description: string;
  priceCents: number;
  qualityScore: number;
  licenseType: string;
  sourceCount: number;
  status: string;
  tags: string[];
};

type Overview = {
  recordedPaidOrderValueCents: number;
  paidOrders: number;
  publishedDatasets: number;
  totalDatasets: number;
  supplierResearchRecords: number;
  latestSupplierRetrievedAt: string | null;
};

export default function HomePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [datasetsRes, overviewRes] = await Promise.all([
          fetch(`${API}/datasets`, { cache: 'no-store' }),
          fetch(`${API}/marketplace/overview`, { cache: 'no-store' }),
        ]);

        const datasetsJson = await datasetsRes.json();
        const overviewJson = await overviewRes.json();
        setDatasets(datasetsJson.datasets || []);
        setOverview(overviewJson.snapshot || null);
      } catch (error) {
        console.error('Failed to load marketplace data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <nav className="topbar">
          <div className="brand">AIDATA</div>
          <div className="nav-links">
            <a href="#catalog">Catalog</a>
            <a href="#automation">Automation</a>
            <a href="#money">Revenue</a>
            <a href="/suppliers">Supplier research</a>
          </div>
          <a href="/dashboard" className="primary-button">Open dashboard</a>
        </nav>

        <div className="hero-grid">
          <div>
            <span className="eyebrow">AI DATA MARKETPLACE</span>
            <h1>Search the web, clean the data, and sell it at scale.</h1>
            <p>
              Discover market signals, organize real supplier and business intelligence, and prepare datasets for marketplace sales. Payment processing and cashouts stay disabled until a verified provider is connected.
            </p>
            <div className="cta-row">
              <a href="#catalog" className="primary-button">Browse datasets</a>
              <a href="/dashboard" className="secondary-button">View analytics</a>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-row">
              <span>Recorded paid order value</span>
              <strong>{overview ? formatMoney(overview.recordedPaidOrderValueCents) : '—'}</strong>
            </div>
            <div className="stat-row">
              <span>Published datasets</span>
              <strong>{overview?.publishedDatasets ?? '—'}</strong>
            </div>
            <div className="stat-row">
              <span>Paid orders recorded</span>
              <strong>{overview?.paidOrders ?? '—'}</strong>
            </div>
            <div className="stat-row highlight">
              <span>Supplier research records</span>
              <strong>{overview?.supplierResearchRecords ?? '—'}</strong>
            </div>
            <p className="marketplace-data-note">Live database counts. Orders marked paid in the database are not proof that a payment processor settled funds. Checkout and payouts are currently disabled.</p>
          </div>
        </div>
      </section>

      <section id="automation" className="feature-grid">
        <article className="feature-card">
          <span className="feature-number">01</span>
          <h3>Web agent discovery</h3>
          <p>AI bots continuously find and validate high-signal data sources across the web.</p>
        </article>
        <article className="feature-card">
          <span className="feature-number">02</span>
          <h3>Cleaning + quality scoring</h3>
          <p>Normalize, deduplicate, and enrich raw records before pricing and publishing.</p>
        </article>
        <article className="feature-card">
          <span className="feature-number">03</span>
          <h3>Marketplace monetization</h3>
          <p>Sell premium data products with a built-in wallet, payouts, and revenue tracking.</p>
        </article>
      </section>

      <section id="catalog" className="catalog-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MARKETPLACE</span>
            <h2>Curated datasets</h2>
          </div>
          <a href="/dashboard" className="secondary-button">Seller dashboard</a>
        </div>

        {loading ? (
          <p className="empty-state">Loading marketplace...</p>
        ) : (
          <div className="dataset-grid">
            {datasets.map((dataset) => (
              <article key={dataset.id} className="dataset-card">
                <div className="card-topline">
                  <span className="pill">{dataset.category}</span>
                  <span className="score">{dataset.qualityScore}/100</span>
                </div>
                <h3>{dataset.title}</h3>
                <p>{dataset.description}</p>
                <div className="tag-row">
                  {dataset.tags.map((tag) => (
                    <span key={tag} className="tag">#{tag}</span>
                  ))}
                </div>
                <div className="card-footer">
                  <div>
                    <small>Sources</small>
                    <strong>{dataset.sourceCount}</strong>
                  </div>
                  <div className="price-box">
                    <small>Price</small>
                    <strong>{formatMoney(dataset.priceCents)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="money" className="money-section">
        <div className="money-card">
          <span className="eyebrow">FINANCIAL ENGINE</span>
          <h2>Store profits, manage payouts, and cash out to bank.</h2>
          <ul>
            <li>Each purchase is recorded in the wallet ledger.</li>
            <li>Marketplace commission logic is handled automatically.</li>
            <li>Payout requests can be queued and approved to a bank account.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Health = {
  updatedAt: string;
  thresholds: { staleAfterHours: number; taskWindowHours: number };
  research: { totalRecords: number; staleRecords: number; latestRetrievedAt: string | null; latestSource: string | null; latestAgeHours: number | null; status: string };
  agents: { running: number; failedLast24Hours: number; recentRuns: Array<{ id: string; agentName: string; agentType: string; taskName: string; status: string; message: string; recordsFetched: number; recordsSaved: number; recordsFailed: number; startedAt: string; completedAt: string | null }>; collectors: Array<{ agentName: string; status: string; message: string; startedAt: string; completedAt: string | null }> };
  payments: { failedOrdersLast24Hours: number; failedWalletTransactionsLast24Hours: number; note: string };
};

const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'No recorded run';
const statusClass = (value: string) => value === 'COMPLETED' || value === 'fresh' ? 'ops-good' : value === 'RUNNING' ? 'ops-running' : 'ops-alert';

export default function OperationsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/operations/health`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load operations health.');
      setHealth(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load operations health.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm uppercase tracking-widest text-cyan-400">AI Data Marketplace</p><h1 className="text-3xl font-bold">Operations health</h1><p className="mt-1 text-sm text-slate-400">Live checks from recorded database activity. No sample figures.</p></div>
          <div className="flex gap-3"><a className="rounded-lg border border-slate-700 px-4 py-2" href="/dashboard">Dashboard</a><button onClick={() => { setLoading(true); void load(); }} className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold">Refresh</button></div>
        </div>
        {loading && <p className="text-slate-400">Loading live operations data…</p>}
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-700 bg-rose-950/40 p-4 text-rose-200">{error}</div>}
        {health && <>
          <p className="mb-4 text-xs text-slate-500">Updated {date(health.updatedAt)} · stale means no refresh in {health.thresholds.staleAfterHours} hours · failure window {health.thresholds.taskWindowHours} hours</p>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Supplier research records" value={health.research.totalRecords} detail="Stored source records" />
            <Metric label="Stale research records" value={health.research.staleRecords} detail={health.research.latestAgeHours === null ? 'No retrieval recorded' : `Newest record is ${health.research.latestAgeHours} hours old`} />
            <Metric label="Agent tasks running" value={health.agents.running} detail="Currently marked RUNNING" />
            <Metric label="Agent failures · 24h" value={health.agents.failedLast24Hours} detail="Recorded FAILED task runs" alert={health.agents.failedLast24Hours > 0} />
            <Metric label="Failed orders · 24h" value={health.payments.failedOrdersLast24Hours} detail="Application order records" alert={health.payments.failedOrdersLast24Hours > 0} />
            <Metric label="Failed wallet transactions · 24h" value={health.payments.failedWalletTransactionsLast24Hours} detail="Application ledger records" alert={health.payments.failedWalletTransactionsLast24Hours > 0} />
          </section>
          <section className="mt-7 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-xl font-semibold">Research freshness</h2>
            <p className="mb-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(health.research.status)}`}>{health.research.status.replaceAll('_', ' ')}</span></p>
            <p className="text-sm text-slate-300">Latest source: {health.research.latestSource || 'None'} · Last retrieved: {date(health.research.latestRetrievedAt)}</p>
            <p className="mt-2 text-xs text-slate-500">Stale count is record-age monitoring only; it does not imply a source outage.</p>
          </section>
          <section className="mt-7 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-xl font-semibold">Latest collector runs</h2>
            {health.agents.collectors.length === 0 ? <p className="text-slate-400">No USAspending or SAM.gov collector runs have been recorded.</p> : <div className="space-y-3">{health.agents.collectors.map(run => <div key={run.agentName} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3"><div><p className="font-medium">{run.agentName}</p><p className="text-xs text-slate-400">{date(run.startedAt)} · {run.message}</p></div><span className={`rounded-full px-3 py-1 text-xs ${statusClass(run.status)}`}>{run.status}</span></div>)}</div>}
          </section>
          <section className="mt-7 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-xl font-semibold">Recent agent activity</h2>
            {health.agents.recentRuns.length === 0 ? <p className="text-slate-400">No agent task runs recorded yet.</p> : <div className="space-y-3">{health.agents.recentRuns.map(task => <article key={task.id} className="border-b border-slate-800 pb-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{task.agentName} <span className="text-xs text-slate-500">({task.agentType})</span></p><p className="text-sm text-slate-300">{task.taskName}</p></div><span className={`rounded-full px-3 py-1 text-xs ${statusClass(task.status)}`}>{task.status}</span></div><p className="mt-1 text-xs text-slate-400">{date(task.startedAt)} · fetched {task.recordsFetched}, saved {task.recordsSaved}, failed {task.recordsFailed}</p><p className="mt-1 text-sm text-slate-400">{task.message}</p></article>)}</div>}
          </section>
          <p className="mt-5 text-xs text-slate-500">{health.payments.note} This page does not initiate retries, publish products, send messages, or process payouts.</p>
        </>}
      </div>
    </main>
  );
}

function Metric({ label, value, detail, alert = false }: { label: string; value: number; detail: string; alert?: boolean }) {
  return <article className={`rounded-xl border p-4 ${alert ? 'border-rose-800 bg-rose-950/30' : 'border-slate-800 bg-slate-900'}`}><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>;
}

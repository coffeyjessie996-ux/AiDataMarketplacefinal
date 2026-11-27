'use client';

import { useEffect, useState } from 'react';
import './operations.css';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Maintenance = { checkedAt: string; policy: { staleTaskThresholdMinutes: number; automaticRepair: string; approvalRequiredFor: string[] }; incidents: { staleRunningTasks: number; failedTasksLast24Hours: number }; failureDiagnostics: { windowHours: number; inspectedFailureCount: number; categories: Record<string, number>; recentFailures: Array<{ id: string; agentName: string; taskName: string; message: string; category: string; recommendedAction: string; startedAt: string }> }; recentRepairs: Array<{ id: string; taskName: string; status: string; message: string; startedAt: string; completedAt: string | null; recordsFetched: number }> };

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
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
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
      const maintenanceResponse = await fetch(`${API}/maintenance/status`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const maintenanceData = await maintenanceResponse.json().catch(() => ({}));
      if (maintenanceResponse.ok) setMaintenance(maintenanceData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load operations health.');
    } finally {
      setLoading(false);
    }
  }

  async function runMaintenance() {
    try {
      setRepairing(true);
      setMaintenanceMessage('');
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/maintenance/run`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Maintenance run failed.');
      setMaintenanceMessage(data.staleTasksReconciled > 0 ? `Maintenance safely reconciled ${data.staleTasksReconciled} stuck task(s).` : 'Maintenance check complete. No repair was needed.');
      await load();
    } catch (err) {
      setMaintenanceMessage(err instanceof Error ? err.message : 'Maintenance run failed.');
    } finally {
      setRepairing(false);
    }
  }
  useEffect(() => { void load(); }, []);

  return (
    <main className="ops-page min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
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
          <section className="mt-7 rounded-xl border border-cyan-900 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-semibold">AI Maintenance Team</h2><p className="mt-1 text-sm text-slate-400">Scheduled daily checks plus an admin-triggered check. Safe repair scope only.</p></div>
              <button disabled={repairing} onClick={() => void runMaintenance()} className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold disabled:opacity-50">{repairing ? 'Checking…' : 'Run maintenance check'}</button>
            </div>
            {maintenanceMessage && <p role="status" className="mt-3 text-sm text-cyan-200">{maintenanceMessage}</p>}
            {maintenance ? <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Stuck tasks detected" value={maintenance.incidents.staleRunningTasks} detail={`Older than ${maintenance.policy.staleTaskThresholdMinutes} minutes`} alert={maintenance.incidents.staleRunningTasks > 0} />
                <Metric label="Failed agent tasks · 24h" value={maintenance.incidents.failedTasksLast24Hours} detail="Recorded failures; not all require repair" alert={maintenance.incidents.failedTasksLast24Hours > 0} />
                <Metric label="Maintenance actions" value={maintenance.recentRepairs.length} detail="Recent recorded maintenance runs" />
              </div>
              <p className="mt-3 text-xs text-slate-400">{maintenance.policy.automaticRepair}</p>
              <div className="mt-5">
                <h3 className="mb-2 font-semibold">Investigator · failure patterns ({maintenance.failureDiagnostics.windowHours}h)</h3>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {Object.entries(maintenance.failureDiagnostics.categories).map(([category, count]) => <div key={category} className="rounded-lg border border-slate-800 p-3"><p className="text-xs capitalize text-slate-400">{category.replaceAll('_', ' ')}</p><p className="text-xl font-semibold">{count}</p></div>)}
                </div>
                {maintenance.failureDiagnostics.recentFailures.length > 0 ? <div className="mt-3 space-y-3">{maintenance.failureDiagnostics.recentFailures.slice(0,8).map(failure => <article key={failure.id} className="rounded-lg border border-slate-800 p-3"><p className="text-sm font-medium">{failure.agentName} · {failure.category.replaceAll('_', ' ')}</p><p className="text-xs text-slate-400">{failure.taskName} · {date(failure.startedAt)}</p><p className="mt-1 text-sm text-slate-300">{failure.message}</p><p className="mt-1 text-xs text-cyan-200">Suggested next step: {failure.recommendedAction}</p></article>)}</div> : <p className="mt-3 text-sm text-slate-400">No failed agent runs found in this window.</p>}
              </div>
              <p className="mt-1 text-xs text-slate-500">Approval remains required for: {maintenance.policy.approvalRequiredFor.join(', ')}.</p>
              {maintenance.recentRepairs.length > 0 && <div className="mt-4 space-y-2">{maintenance.recentRepairs.slice(0,5).map(run => <article key={run.id} className="border-b border-slate-800 pb-2"><p className="text-sm font-medium">{run.taskName} · {run.status}</p><p className="text-xs text-slate-400">{date(run.startedAt)} · {run.message}</p></article>)}</div>}
            </> : <p className="mt-4 text-sm text-slate-400">Maintenance status is unavailable for this account.</p>}
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

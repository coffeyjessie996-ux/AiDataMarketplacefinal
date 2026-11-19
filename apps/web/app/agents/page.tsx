'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type Task = {
  id: string;
  agentName: string;
  agentType: string;
  taskName: string;
  status: string;
  message: string;
  recordsFetched: number;
  recordsSaved: number;
  recordsFailed: number;
  startedAt: string;
  completedAt: string | null;
};

type ActivityResponse = {
  updatedAt: string;
  tasks: Task[];
  summary: { running: number; completedToday: number; failedToday: number };
  researchAutomation: { enabled: boolean; providerConfigured: boolean; providerStatus: string; autonomousAgentsConnected: boolean; note: string };
  pollingIntervalMs: number;
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
}

function duration(task: Task) {
  const start = new Date(task.startedAt).getTime();
  const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function AgentActivityPage() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [runningAgent, setRunningAgent] = useState('');
  const [runFeedback, setRunFeedback] = useState('');

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in to view agent activity.');
      const response = await fetch(`${API}/agents/activity?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load activity feed.');
      setData(result as ActivityResponse);
      setLastUpdated(new Date().toLocaleTimeString());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load activity feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const runAgent = async (agentId: string) => {
    setRunningAgent(agentId); setRunFeedback('Button press received. Sending the agent request…'); setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Please sign in first.');
      const response = await fetch(`${API}/agents/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Agent task failed.');
      setRunFeedback(result.message || 'Agent task completed successfully.');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent task failed.';
      setRunFeedback(`The request did not complete: ${message}`);
      setError(message);
    } finally {
      setRunningAgent('');
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0b1220', color: '#e5edf8' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <a href="/dashboard" style={{ color: '#93c5fd', textDecoration: 'none' }}>← Dashboard</a>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="/data-bank" style={{ color: '#93c5fd', textDecoration: 'none' }}>AI Data Bank</a>
            <a href="/pipeline" style={{ color: '#93c5fd', textDecoration: 'none' }}>Sales pipeline</a>
            <a href="/agents/opportunities" style={{ color: '#93c5fd', textDecoration: 'none' }}>Paid work opportunities</a>
          </div>
        </nav>

        <header style={{ marginBottom: 22 }}>
          <p style={{ color: '#60a5fa', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>OPERATIONS MONITOR</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 42px)', margin: '8px 0' }}>Collection &amp; Research Activity</h1>
          <p style={{ color: '#a8b6ca', lineHeight: 1.6, maxWidth: 820 }}>
            View actual scheduled collector runs and public-record research triage tasks. This feed refreshes automatically every five seconds; it is not a claim that autonomous multi-agent sales or research teams are connected.
          </p>
        </header>

        <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>Marketplace AI workforce</h2>
          <p style={{ color: '#a8b6ca', lineHeight: 1.55 }}>Run three controlled agents against records already stored in your marketplace. These first jobs are read-only: they do not scrape websites, send emails, publish datasets, spend money, or create sales.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {[
              { id: 'research_opportunity_scan', title: '1. Research & opportunity finder', detail: 'Review saved research records and source coverage.' },
              { id: 'data_rights_audit', title: '2. Data production & rights audit', detail: 'Check datasets, listings, auctions, and source approval.' },
              { id: 'buyer_pipeline_audit', title: '3. Buyer & sales support', detail: 'Summarize buyer inquiries and lead stages.' },
            ].map(agent => <article key={agent.id} style={{ background: '#17263a', border: '1px solid #334155', borderRadius: 9, padding: 14 }}>
              <strong>{agent.title}</strong><p style={{ color: '#a8b6ca', minHeight: 42, fontSize: 13 }}>{agent.detail}</p>
              <button disabled={Boolean(runningAgent)} onClick={() => void runAgent(agent.id)} style={{ padding: '9px 12px', border: 0, borderRadius: 7, background: runningAgent === agent.id ? '#475569' : '#2563eb', color: 'white', cursor: runningAgent ? 'wait' : 'pointer' }}>{runningAgent === agent.id ? 'Running…' : 'Run agent'}</button>
            </article>)}
          </div>
          {runFeedback && <p role="status" aria-live="polite" style={{ marginTop: 14, padding: 12, background: runFeedback.startsWith('The request did not complete:') ? '#451a1a' : '#123329', borderRadius: 8, color: runFeedback.startsWith('The request did not complete:') ? '#fecaca' : '#bbf7d0', lineHeight: 1.5 }}>{runFeedback}</p>}
        </section>

        {data && <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Tasks running now</div>
            <strong style={{ fontSize: 28 }}>{data.summary.running}</strong>
          </div>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Completed today</div>
            <strong style={{ fontSize: 28 }}>{data.summary.completedToday}</strong>
          </div>
          <div style={{ background: '#101a2b', border: '1px solid #26364d', borderRadius: 10, padding: 16 }}>
            <div style={{ color: '#93a4bd', fontSize: 12 }}>Failed today</div>
            <strong style={{ fontSize: 28 }}>{data.summary.failedToday}</strong>
          </div>
        </section>}

        <section style={{ background: '#101a2b', border: '1px solid #334155', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>Scheduled research triage: {data?.researchAutomation.enabled ? 'Enabled' : 'Not configured'}</strong>
            <span style={{ color: '#93a4bd', fontSize: 12 }}>{data?.researchAutomation.providerConfigured ? 'OpenAI key configured · connectivity unverified' : 'Rules-based fallback only'}</span>
          </div>
          <p style={{ color: '#b8c6d9', margin: '8px 0 0', lineHeight: 1.5 }}>
            {data?.researchAutomation.note || 'The activity feed records scheduled collectors and research triage jobs.'}
          </p>
        </section>

        <section style={{ border: '1px solid #26364d', borderRadius: 12, overflow: 'hidden', background: '#101a2b' }}>
          <div style={{ padding: 15, borderBottom: '1px solid #26364d', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong>Recent task activity</strong>
            <span style={{ color: '#93a4bd', fontSize: 12 }}>Auto-refresh · last checked {lastUpdated || '—'}</span>
          </div>
          {error && <p role="alert" style={{ margin: 16, padding: 12, borderRadius: 8, background: '#451a1a', color: '#fecaca' }}>{error}</p>}
          {loading ? <p style={{ padding: 18, color: '#94a3b8' }}>Connecting to activity log…</p> :
            data?.tasks.length ? <div>
              {data.tasks.map(task => {
                const running = task.status === 'RUNNING';
                const failed = task.status === 'FAILED';
                const color = running ? '#fbbf24' : failed ? '#fca5a5' : '#86efac';
                return <article key={task.id} style={{ padding: 16, borderBottom: '1px solid #26364d' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <strong>{task.agentName}</strong>
                        <span style={{ fontSize: 10, letterSpacing: 1, color: task.agentType === 'automation' ? '#93a4bd' : '#fbbf24', border: '1px solid #334155', borderRadius: 20, padding: '3px 7px' }}>{task.taskName.toLowerCase().includes('public web scraper') ? 'MANUAL WEB SNAPSHOT' : task.agentType === 'automation' ? 'SCHEDULED AUTOMATION' : 'RESEARCH TRIAGE'}</span>
                      </div>
                      <div style={{ color: '#cbd5e1', marginTop: 5 }}>{task.taskName}</div>
                    </div>
                    <span style={{ color, fontSize: 12, fontWeight: 700 }}>{running ? '● RUNNING' : failed ? '● FAILED' : '● COMPLETED'}</span>
                  </div>
                  <p style={{ color: '#a8b6ca', margin: '10px 0', lineHeight: 1.5 }}>{task.message}</p>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: '#93a4bd', fontSize: 12 }}>
                    <span>Fetched: {task.recordsFetched}</span>
                    <span>Saved: {task.recordsSaved}</span>
                    <span>Skipped / failed: {task.recordsFailed}</span>
                    <span>Duration: {duration(task)}</span>
                  </div>
                  <div style={{ color: '#8291a7', fontSize: 11, marginTop: 8 }}>Started {formatTime(task.startedAt)}{task.completedAt ? ` · Finished ${formatTime(task.completedAt)}` : ' · Still running'}</div>
                </article>;
              })}
            </div> : <p style={{ padding: 18, color: '#94a3b8' }}>No task runs have been recorded yet. When a scheduled collector or scraper starts, its real activity will appear here.</p>}
        </section>
        <p style={{ color: '#8291a7', fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>
          Activity is written by the actual job handlers. A task appears as running while its job is executing and is updated when it succeeds or fails. Collection counts are not sales or revenue.
        </p>
      </div>
    </main>
  );
}

import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { inspectRecentMaintenanceFailures, reconcileStaleAgentTasks, STALE_AGENT_TASK_MINUTES } from '../services/maintenance';

type AuthReq = express.Request & { user?: User };

export function createMaintenanceRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.use((req, res, next) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    return next();
  });

  router.get('/status', async (_req, res) => {
    try {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - STALE_AGENT_TASK_MINUTES * 60_000);
      const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [staleRunning, failed24h, recentMaintenanceRuns, failureDiagnostics] = await Promise.all([
        prisma.agentTaskRun.count({ where: { status: 'RUNNING', startedAt: { lt: staleBefore } } }),
        prisma.agentTaskRun.count({ where: { status: 'FAILED', startedAt: { gte: since24h } } }),
        prisma.agentTaskRun.findMany({
          where: { agentName: 'Marketplace Maintenance Team' },
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: { id: true, taskName: true, status: true, message: true, startedAt: true, completedAt: true, recordsFetched: true },
        }),
        inspectRecentMaintenanceFailures(prisma, now),
      ]);
      return res.json({
        source: 'live_database',
        checkedAt: now.toISOString(),
        policy: {
          staleTaskThresholdMinutes: STALE_AGENT_TASK_MINUTES,
          automaticRepair: 'Only marks agent runs older than the threshold as FAILED; it does not rerun collectors or change source, customer, listing, order, or payment data.',
          approvalRequiredFor: ['code changes', 'database migrations', 'data deletion', 'publishing', 'outbound messages', 'payments and payouts'],
        },
        incidents: { staleRunningTasks: staleRunning, failedTasksLast24Hours: failed24h },
        failureDiagnostics,
        recentRepairs: recentMaintenanceRuns,
      });
    } catch (error) {
      console.error('Maintenance status query failed', error);
      return res.status(500).json({ error: 'Unable to load maintenance status.' });
    }
  });

  router.post('/run', async (_req, res) => {
    try {
      const result = await reconcileStaleAgentTasks(prisma);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('Maintenance reconciliation failed', error);
      return res.status(500).json({ error: 'Maintenance reconciliation failed. No further automatic action was taken.' });
    }
  });

  return router;
}

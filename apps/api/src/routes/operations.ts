import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };

const STALE_AFTER_HOURS = 48;

export function createOperationsRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.get('/health', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });

    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_AFTER_HOURS * 60 * 60 * 1000);
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    try {
      const [
        latestResearch,
        researchCount,
        staleResearchCount,
        runningTasks,
        recentTasks,
        failedTasks24h,
        failedOrders24h,
        failedTransactions24h,
        latestCollectorRuns,
      ] = await Promise.all([
        prisma.supplierResearchRecord.findFirst({ orderBy: { retrievedAt: 'desc' }, select: { retrievedAt: true, source: true } }),
        prisma.supplierResearchRecord.count(),
        prisma.supplierResearchRecord.count({ where: { retrievedAt: { lt: staleBefore } } }),
        prisma.agentTaskRun.count({ where: { status: 'RUNNING' } }),
        prisma.agentTaskRun.findMany({
          orderBy: { startedAt: 'desc' }, take: 20,
          select: { id: true, agentName: true, agentType: true, taskName: true, status: true, message: true, recordsFetched: true, recordsSaved: true, recordsFailed: true, startedAt: true, completedAt: true },
        }),
        prisma.agentTaskRun.count({ where: { status: 'FAILED', startedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
        prisma.order.count({ where: { status: 'FAILED', createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
        prisma.walletTransaction.count({ where: { status: 'FAILED', createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
        prisma.agentTaskRun.findMany({
          where: { agentName: { in: ['USAspending collector', 'SAM.gov collector'] } },
          orderBy: { startedAt: 'desc' }, distinct: ['agentName'], take: 2,
          select: { agentName: true, status: true, message: true, startedAt: true, completedAt: true },
        }),
      ]);

      const latestResearchAgeHours = latestResearch
        ? Math.max(0, Math.round((now.getTime() - latestResearch.retrievedAt.getTime()) / 3600000))
        : null;
      return res.json({
        source: 'live_database',
        updatedAt: now.toISOString(),
        thresholds: { staleAfterHours: STALE_AFTER_HOURS, taskWindowHours: 24 },
        research: {
          totalRecords: researchCount,
          staleRecords: staleResearchCount,
          latestRetrievedAt: latestResearch?.retrievedAt.toISOString() ?? null,
          latestSource: latestResearch?.source ?? null,
          latestAgeHours: latestResearchAgeHours,
          status: researchCount === 0 ? 'no_data' : staleResearchCount > 0 ? 'stale_records_present' : 'fresh',
        },
        agents: {
          running: runningTasks,
          failedLast24Hours: failedTasks24h,
          recentRuns: recentTasks,
          collectors: latestCollectorRuns,
        },
        payments: {
          failedOrdersLast24Hours: failedOrders24h,
          failedWalletTransactionsLast24Hours: failedTransactions24h,
          note: 'These are failed records in the application database, not payment-provider outage or settlement verification.',
        },
      });
    } catch (error) {
      console.error('Operations health query failed', error);
      return res.status(500).json({ error: 'Unable to load operations health from the database.' });
    }
  });

  return router;
}

import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };

export function createAgentsRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.get('/activity', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const requestedLimit = Number(req.query.limit ?? 40);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 40;

    try {
      const [tasks, running, completedToday, failedToday] = await Promise.all([
        prisma.agentTaskRun.findMany({
          orderBy: [{ startedAt: 'desc' }],
          take: limit,
          select: {
            id: true,
            agentName: true,
            agentType: true,
            taskName: true,
            status: true,
            message: true,
            recordsFetched: true,
            recordsSaved: true,
            recordsFailed: true,
            startedAt: true,
            completedAt: true,
          },
        }),
        prisma.agentTaskRun.count({ where: { status: 'RUNNING' } }),
        prisma.agentTaskRun.count({
          where: { status: 'COMPLETED', startedAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } },
        }),
        prisma.agentTaskRun.count({
          where: { status: 'FAILED', startedAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } },
        }),
      ]);

      return res.json({
        source: 'database',
        updatedAt: new Date().toISOString(),
        tasks,
        summary: { running, completedToday, failedToday },
        researchAutomation: {
          enabled: true,
          providerConfigured: Boolean(process.env.OPENAI_API_KEY),
          providerStatus: process.env.OPENAI_API_KEY ? 'configured_not_live_verified' : 'rules_fallback_only',
          autonomousAgentsConnected: false,
          note: process.env.OPENAI_API_KEY
            ? 'This is a scheduled, single-step research triage job—not an autonomous multi-agent system. An OpenAI API key is configured, but provider connectivity is not verified by this activity feed. The job uses OpenAI when available and falls back to deterministic no-cost rules when the provider quota is exhausted.'
            : 'This is a scheduled, single-step research triage job—not an autonomous multi-agent system. It currently uses deterministic no-cost rules and does not verify suppliers or send outreach.',
        },
        pollingIntervalMs: 5000,
      });
    } catch (error) {
      console.error('Agent activity feed failed', error);
      return res.status(500).json({ error: 'Unable to load agent activity.' });
    }
  });

  return router;
}

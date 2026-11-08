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
        aiAgents: {
          enabled: true,
          status: process.env.OPENAI_API_KEY ? 'ai_with_rules_fallback' : 'rules_fallback',
          note: process.env.OPENAI_API_KEY
            ? 'Research triage uses OpenAI when available and automatically falls back to transparent no-cost rules if the API quota is exhausted. It does not verify suppliers or send outreach.'
            : 'No-cost rules-based research triage is available without OpenAI credits. It scores public-record completeness only; it does not verify suppliers or send outreach.',
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

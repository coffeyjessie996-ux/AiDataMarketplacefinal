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
          enabled: Boolean(process.env.OPENAI_API_KEY),
          status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
          note: process.env.OPENAI_API_KEY
            ? 'The OpenAI research analyst is configured to analyze up to three new Data Bank records per daily run. It performs research triage only and does not send outreach.'
            : 'The feed tracks real collection automations. Add OPENAI_API_KEY to the API production environment to enable the scheduled research analyst.',
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

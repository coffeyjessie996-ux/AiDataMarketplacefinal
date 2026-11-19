import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { SOURCE_RIGHTS_POLICY } from '../services/source-rights';

type AuthReq = express.Request & { user?: User };
const agentJobs = ['research_opportunity_scan', 'data_rights_audit', 'buyer_pipeline_audit'] as const;
type AgentJob = (typeof agentJobs)[number];

export function createAgentsRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.get('/catalog', (_req, res) => res.json({
    agents: [
      { id: 'research_opportunity_scan', name: 'Research & Opportunity Agent', purpose: 'Summarizes existing internal research records and identifies missing evidence.', actions: 'Read-only database analysis; no scraping or external contact.' },
      { id: 'data_rights_audit', name: 'Data Production & Rights Agent', purpose: 'Checks datasets, listings, and source tags against the source-rights register.', actions: 'Read-only compliance audit; cannot publish or price data.' },
      { id: 'buyer_pipeline_audit', name: 'Buyer & Sales Support Agent', purpose: 'Summarizes buyer inquiries and sales-pipeline stages for human follow-up.', actions: 'Read-only pipeline analysis; cannot send messages or change deal stages.' },
    ],
    executionMode: 'manual_on_demand',
    externalActionsEnabled: false,
    paymentExecutionEnabled: false,
  }));

  router.post('/run', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Only an administrator can run marketplace agents.' });
    const job = req.body?.agentId as AgentJob;
    if (!agentJobs.includes(job)) return res.status(400).json({ error: 'Choose one of the available agent jobs.' });

    const definitions: Record<AgentJob, { name: string; task: string }> = {
      research_opportunity_scan: { name: 'Research & Opportunity Agent', task: 'Review internal research records' },
      data_rights_audit: { name: 'Data Production & Rights Agent', task: 'Audit dataset publication rights' },
      buyer_pipeline_audit: { name: 'Buyer & Sales Support Agent', task: 'Review buyer demand and sales pipeline' },
    };
    let taskId: string | null = null;
    try {
      const started = await prisma.agentTaskRun.create({
        data: { agentName: definitions[job].name, agentType: 'ai_agent', taskName: definitions[job].task, status: 'RUNNING', message: 'Agent started a read-only audit.' },
        select: { id: true },
      });
      taskId = started.id;
      let message = '';
      let recordsFetched = 0;
      if (job === 'research_opportunity_scan') {
        const [total, bySource, namedSuppliers] = await Promise.all([
          prisma.supplierResearchRecord.count(),
          prisma.supplierResearchRecord.groupBy({ by: ['source'], _count: { _all: true }, orderBy: { _count: { source: 'desc' } } }),
          prisma.supplierResearchRecord.count({ where: { supplierName: { not: null } } }),
        ]);
        recordsFetched = total;
        const sources = bySource.map((item) => `${item.source}: ${item._count._all}`).join('; ') || 'No saved source records';
        message = `Research scan complete. ${total} saved records; ${namedSuppliers} include a supplier name. Source breakdown: ${sources}. These are research records, not verified prospects or revenue.`;
      } else if (job === 'data_rights_audit') {
        const [datasets, listings, published, openAuctions] = await Promise.all([
          prisma.dataset.findMany({ select: { id: true, status: true, tags: true } }),
          prisma.listing.count(),
          prisma.dataset.count({ where: { status: 'PUBLISHED' } }),
          prisma.auction.count({ where: { status: 'OPEN' } }),
        ]);
        const sourceNames = new Set<string>();
        for (const dataset of datasets) for (const tag of dataset.tags) if (tag.startsWith('source:')) sourceNames.add(tag.slice(7));
        const approved = [...sourceNames].filter((source) => SOURCE_RIGHTS_POLICY[source]?.status === 'commercial_reuse_approved');
        const unresolved = [...sourceNames].filter((source) => SOURCE_RIGHTS_POLICY[source]?.status !== 'commercial_reuse_approved');
        recordsFetched = datasets.length;
        message = `Rights audit complete. ${datasets.length} datasets, ${listings} listings, ${published} published datasets, ${openAuctions} open auctions. Tagged sources: ${[...sourceNames].join(', ') || 'none'}. Approved sources: ${approved.join(', ') || 'none'}. Unresolved or unregistered sources: ${unresolved.join(', ') || 'none'}. No data was published or changed.`;
      } else {
        const [leads, byStage, inquiries] = await Promise.all([
          prisma.lead.count(),
          prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
          prisma.buyerDemandEvent.count(),
        ]);
        recordsFetched = leads + inquiries;
        const stages = byStage.map((item) => `${item.stage}: ${item._count._all}`).join('; ') || 'No pipeline leads';
        message = `Buyer pipeline scan complete. ${leads} supplier leads; ${inquiries} buyer-demand events. Pipeline: ${stages}. Supplier leads are not confirmed buyers; inquiries are not orders. No outreach was sent.`;
      }
      await prisma.agentTaskRun.update({ where: { id: taskId }, data: {
        status: 'COMPLETED', message: message.slice(0, 500), recordsFetched, recordsSaved: 0, recordsFailed: 0, completedAt: new Date(),
      } });
      return res.json({ ok: true, taskId, agentId: job, message, note: 'Read-only analysis only. No external websites were accessed, no emails were sent, no listings were published, and no revenue was generated by this run.' });
    } catch (error) {
      console.error('Agent job failed', error);
      if (taskId) await prisma.agentTaskRun.update({ where: { id: taskId }, data: {
        status: 'FAILED', message: 'Agent audit failed. No external actions were taken.', recordsFailed: 1, completedAt: new Date(),
      } }).catch(() => undefined);
      return res.status(500).json({ error: 'Agent task failed. Check the activity feed for its status.' });
    }
  });

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
            id: true, agentName: true, agentType: true, taskName: true, status: true, message: true,
            recordsFetched: true, recordsSaved: true, recordsFailed: true, startedAt: true, completedAt: true,
          },
        }),
        prisma.agentTaskRun.count({ where: { status: 'RUNNING' } }),
        prisma.agentTaskRun.count({ where: { status: 'COMPLETED', startedAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } }),
        prisma.agentTaskRun.count({ where: { status: 'FAILED', startedAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } }),
      ]);

      return res.json({
        source: 'database', updatedAt: new Date().toISOString(), tasks,
        summary: { running, completedToday, failedToday },
        researchAutomation: {
          enabled: true, providerConfigured: Boolean(process.env.OPENAI_API_KEY),
          providerStatus: process.env.OPENAI_API_KEY ? 'configured_not_live_verified' : 'rules_fallback_only',
          autonomousAgentsConnected: false,
          note: 'On-demand workforce agents currently run read-only internal audits. Scheduled research triage is a separate single-step job; no autonomous external sales or payment execution is enabled.',
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

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

  const requireAgentRole: express.RequestHandler = (req, res, next) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'seller' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Marketplace agents are available to seller and administrator accounts.' });
    }
    next();
  };

  router.get('/catalog', requireAgentRole, (_req, res) => res.json({
    agents: [
      { id: 'research_opportunity_scan', name: 'Research & Opportunity Agent', purpose: 'Summarizes existing internal research records and identifies missing evidence.', actions: 'Read-only database analysis; no scraping or external contact.' },
      { id: 'data_rights_audit', name: 'Data Production & Rights Agent', purpose: 'Checks datasets, listings, and source tags against the source-rights register.', actions: 'Read-only compliance audit; cannot publish or price data.' },
      { id: 'buyer_pipeline_audit', name: 'Buyer & Sales Support Agent', purpose: 'Summarizes buyer inquiries and sales-pipeline stages for human follow-up.', actions: 'Read-only pipeline analysis; cannot send messages or change deal stages.' },
    ],
    executionMode: 'manual_on_demand',
    externalActionsEnabled: false,
    paymentExecutionEnabled: false,
  }));

  router.post('/run', requireAgentRole, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const isAdmin = user.role === 'admin';
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
          prisma.dataset.findMany({
            where: isAdmin ? {} : { sellerId: user.id },
            select: { id: true, status: true, tags: true },
          }),
          prisma.listing.count({ where: isAdmin ? {} : { dataset: { sellerId: user.id } } }),
          prisma.dataset.count({ where: { ...(isAdmin ? {} : { sellerId: user.id }), status: 'PUBLISHED' } }),
          prisma.auction.count({ where: { status: 'OPEN', ...(isAdmin ? {} : { dataset: { sellerId: user.id } }) } }),
        ]);
        const sourceNames = new Set<string>();
        for (const dataset of datasets) for (const tag of dataset.tags) if (tag.startsWith('source:')) sourceNames.add(tag.slice(7));
        const approved = [...sourceNames].filter((source) => SOURCE_RIGHTS_POLICY[source]?.status === 'commercial_reuse_approved');
        const unresolved = [...sourceNames].filter((source) => SOURCE_RIGHTS_POLICY[source]?.status !== 'commercial_reuse_approved');
        recordsFetched = datasets.length;
        message = `Rights audit complete. ${datasets.length} datasets, ${listings} listings, ${published} published datasets, ${openAuctions} open auctions. Tagged sources: ${[...sourceNames].join(', ') || 'none'}. Approved sources: ${approved.join(', ') || 'none'}. Unresolved or unregistered sources: ${unresolved.join(', ') || 'none'}. No data was published or changed.`;
      } else {
        const [leads, byStage, inquiries] = await Promise.all([
          prisma.lead.count({ where: isAdmin ? {} : { ownerId: user.id } }),
          prisma.lead.groupBy({ by: ['stage'], where: isAdmin ? {} : { ownerId: user.id }, _count: { _all: true } }),
          prisma.buyerDemandEvent.count({ where: { status: 'SEARCH' } }),
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

  router.get('/activity', requireAgentRole, async (req, res) => {
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


  // Discover real, publicly listed remote roles and previously collected SAM.gov notices.
  // This is discovery only: no applications, bids, outreach, or paid work are submitted.
  router.get('/opportunities/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const taskPattern = /data entry|data analyst|data engineer|research|market research|spreadsheet|virtual assistant|ai trainer|annotation|transcription|lead generation|web researcher|business intelligence|freelance|contractor|remote/i;
    const taskId = await prisma.agentTaskRun.create({
      data: { agentName: 'Opportunity Hunter', agentType: 'ai_agent', taskName: 'Search public paid-work opportunities', status: 'RUNNING', message: 'Searching public job listings and saved government notices.' },
      select: { id: true },
    }).catch(() => null);

    try {
      const remoteResponse = await fetch('https://remoteok.com/api', {
        headers: { accept: 'application/json', 'user-agent': 'AI-Data-Marketplace/1.0 (opportunity discovery; contact: support@aidatamarketplacefinal.vercel.app)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!remoteResponse.ok) throw new Error(`RemoteOK returned HTTP ${remoteResponse.status}`);
      const remotePayload = await remoteResponse.json() as Array<Record<string, unknown>>;
      const remoteRows = Array.isArray(remotePayload) ? remotePayload.slice(1) : [];
      const remoteJobs = remoteRows.flatMap((row) => {
        const title = typeof row.position === 'string' ? row.position : '';
        const company = typeof row.company === 'string' ? row.company : 'Company not listed';
        const description = typeof row.description === 'string' ? row.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) : '';
        const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [];
        const searchable = `${title} ${company} ${description} ${tags.join(' ')}`.toLowerCase();
        if (!title || !taskPattern.test(searchable) || (terms.length && !terms.every((term) => searchable.includes(term)))) return [];
        const url = typeof row.url === 'string' ? row.url : (typeof row.id === 'string' ? `https://remoteok.com/remote-jobs/${row.id}` : 'https://remoteok.com');
        const salary = [row.salary_min, row.salary_max].filter((value) => typeof value === 'number' && value > 0);
        return [{
          id: `remoteok:${String(row.id ?? url)}`, source: 'Remote OK', title, company, description,
          location: typeof row.location === 'string' ? row.location : 'Remote',
          url, postedAt: typeof row.date === 'string' ? row.date : null,
          compensation: salary.length ? salary.map((value) => `$ ${Number(value).toLocaleString()}`).join('–') : 'Not disclosed',
          type: 'remote-role', applicationRequired: true,
        }];
      });

      const samRecords = await prisma.supplierResearchRecord.findMany({
        where: { source: 'sam.gov_opportunities' },
        orderBy: { retrievedAt: 'desc' },
        take: 100,
        select: { sourceRecordId: true, supplierName: true, sourceUrl: true, payload: true, retrievedAt: true },
      });
      const samOpportunities = samRecords.flatMap((record) => {
        const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
          ? record.payload as Record<string, unknown> : {};
        const title = String(payload.title ?? payload.noticeTitle ?? 'Federal solicitation').slice(0, 220);
        const searchable = `${title} ${String(payload.department ?? '')} ${String(payload.naicsCode ?? '')} ${String(payload.setAside ?? '')}`.toLowerCase();
        if (terms.length && !terms.every((term) => searchable.includes(term))) return [];
        return [{
          id: `sam.gov:${record.sourceRecordId}`, source: 'SAM.gov', title,
          company: typeof payload.department === 'string' ? payload.department : 'U.S. federal agency',
          description: `Solicitation ${String(payload.solicitationNumber ?? record.sourceRecordId)}. Type: ${String(payload.type ?? 'Not specified')}. Response deadline: ${String(payload.responseDeadline ?? 'Check the official notice')}. Set-aside: ${String(payload.setAside ?? 'Not specified')}.`.replace(/<[^>]*>/g, ' ').slice(0, 500),
          location: payload.placeOfPerformance ? JSON.stringify(payload.placeOfPerformance).slice(0, 180) : 'See official notice',
          url: record.sourceUrl, postedAt: record.retrievedAt.toISOString(),
          compensation: 'Contract value varies; see solicitation',
          type: 'government-solicitation', applicationRequired: true,
        }];
      });

      const opportunities = [...samOpportunities, ...remoteJobs].slice(0, 100);
      if (taskId) await prisma.agentTaskRun.update({ where: { id: taskId }, data: {
        status: 'COMPLETED', message: `Opportunity search completed: ${opportunities.length} matching public listings (${remoteJobs.length} Remote OK roles, ${samOpportunities.length} saved SAM.gov notices). Listings are leads to evaluate, not guaranteed work or income.`,
        recordsFetched: remoteRows.length + samRecords.length, recordsSaved: 0, recordsFailed: 0, completedAt: new Date(),
      } });
      return res.json({
        ok: true, opportunities,
        sources: [
          { name: 'Remote OK', url: 'https://remoteok.com', count: remoteJobs.length, note: 'Public remote job listings; apply through the original listing.' },
          { name: 'SAM.gov', url: 'https://sam.gov/content/opportunities', count: samOpportunities.length, note: 'Previously collected notices only. Refresh remains subject to SAM.gov API authorization and source terms.' },
        ],
        note: 'Discovery only. Listings may expire or change. Verify pay, eligibility, deadlines, and terms on the source site. No applications, bids, outreach, or payments are automated.',
      });
    } catch (error) {
      if (taskId) await prisma.agentTaskRun.update({ where: { id: taskId }, data: {
        status: 'FAILED', message: error instanceof Error ? error.message.slice(0, 450) : 'Opportunity search failed.',
        recordsFailed: 1, completedAt: new Date(),
      } }).catch(() => undefined);
      console.error('Opportunity search failed', error);
      return res.status(502).json({ error: 'Could not retrieve public opportunities. Try again later.' });
    }
  });

  return router;
}

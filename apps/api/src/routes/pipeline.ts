import express from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };
const stages = ['NEW', 'QUALIFIED', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'] as const;
const stageCloseProbability: Record<(typeof stages)[number], number> = {
  NEW: 5, QUALIFIED: 15, CONTACTED: 25, PROPOSAL: 50, WON: 100, LOST: 0,
};

export function createPipelineRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.get('/leads', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const stage = typeof req.query.stage === 'string' ? req.query.stage.toUpperCase() : '';
    if (stage && !stages.includes(stage as typeof stages[number])) return res.status(400).json({ error: 'Invalid stage.' });
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const leads = await prisma.lead.findMany({
      where: { ...(user.role === 'admin' ? {} : { ownerId: user.id }), ...(stage ? { stage: stage as typeof stages[number] } : {}),
        ...(q ? { companyName: { contains: q, mode: 'insensitive' } } : {}) },
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
    const forecastLeads = leads.map((lead) => {
      const expectedDealValueCents = lead.expectedDealValueCents;
      const expectedMarginPercent = Number(lead.expectedMarginPercent);
      const closeProbabilityPercent = stageCloseProbability[lead.stage];
      const predictedProfitCents = expectedDealValueCents == null ? null
        : Math.round(expectedDealValueCents * expectedMarginPercent / 100 * closeProbabilityPercent / 100);
      return { ...lead, expectedMarginPercent, closeProbabilityPercent, predictedProfitCents };
    });
    return res.json({ count: forecastLeads.length, leads: forecastLeads });
  });

  router.post('/leads', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
    if (companyName.length < 2) return res.status(400).json({ error: 'Company name is required.' });
    const lead = await prisma.lead.create({ data: {
      id: randomUUID(), ownerId: user.id, source: 'manual', sourceKey: `manual:${user.id}:${randomUUID()}`,
      companyName: companyName.slice(0, 200),
      contactName: typeof req.body.contactName === 'string' ? req.body.contactName.slice(0, 160) : null,
      email: typeof req.body.email === 'string' ? req.body.email.slice(0, 254) : null,
      website: typeof req.body.website === 'string' ? req.body.website.slice(0, 500) : null,
      notes: typeof req.body.notes === 'string' ? req.body.notes.slice(0, 4000) : null,
      activities: { create: { type: 'created', description: 'Lead added manually.' } },
    } });
    return res.status(201).json({ lead });
  });

  router.post('/leads/import-suppliers', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const records = await prisma.supplierResearchRecord.findMany({ where: { source: 'usaspending.gov' }, orderBy: { retrievedAt: 'desc' }, take: 500 });
    let imported = 0;
    for (const record of records) {
      const name = record.supplierName?.trim();
      if (!name) continue;
      const amount = Number(record.awardAmount ?? 0);
      const score = amount >= 1000000 ? 85 : amount >= 250000 ? 75 : amount >= 50000 ? 65 : amount >= 10000 ? 55 : 40;
      const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? record.payload as Record<string, unknown> : {};
      const value = (...keys: string[]) => {
        for (const key of keys) {
          const candidate = payload[key];
          if (candidate !== undefined && candidate !== null && String(candidate).trim()) return String(candidate).trim();
        }
        return '';
      };
      const detailParts = [
        value('awardingAgency', 'Awarding Agency', 'awarding_agency_name') && `Agency: ${value('awardingAgency', 'Awarding Agency', 'awarding_agency_name')}`,
        value('performanceState', 'Place of Performance State Code', 'place_of_performance_state_code') && `Performance state: ${value('performanceState', 'Place of Performance State Code', 'place_of_performance_state_code')}`,
        value('naics', 'NAICS', 'naics') && `NAICS: ${value('naics', 'NAICS', 'naics')}`,
        value('supplierUei', 'Recipient UEI', 'recipient_uei') && `UEI: ${value('supplierUei', 'Recipient UEI', 'recipient_uei')}`,
        value('startDate', 'Start Date', 'start_date') && `Start date: ${value('startDate', 'Start Date', 'start_date')}`,
        value('endDate', 'End Date', 'end_date') && `End date: ${value('endDate', 'End Date', 'end_date')}`,
        value('description', 'Description', 'description') && `Award description: ${value('description', 'Description', 'description')}`,
      ].filter(Boolean);
      const description = detailParts.join(' • ').slice(0, 3000) || 'Public federal award recipient record. Contact details are not supplied by this source.';
      const sourceKey = `usaspending.gov:${record.sourceRecordId}:${user.id}`;
      await prisma.lead.upsert({
        where: { sourceKey },
        create: { id: randomUUID(), ownerId: user.id, source: 'usaspending.gov', sourceRecordId: record.sourceRecordId,
          sourceKey, companyName: name, awardAmount: record.awardAmount ?? undefined, score, description,
          activities: { create: { type: 'imported', description: 'Imported and enriched from saved USAspending.gov award details.' } } },
        update: { sourceRecordId: record.sourceRecordId, awardAmount: record.awardAmount ?? undefined, score, description },
      });
      imported++;
    }
    return res.json({ source: 'USAspending.gov', recordsReviewed: records.length, leadsCreatedOrExisting: imported,
      note: 'Score is an award-size prioritization hint only, not supplier verification or predicted conversion.' });
  });

  router.patch('/leads/:id', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, ...(user.role === 'admin' ? {} : { ownerId: user.id }) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    const data: any = {};
    if (typeof req.body?.stage === 'string') {
      const stage = req.body.stage.toUpperCase();
      if (!stages.includes(stage as typeof stages[number])) return res.status(400).json({ error: 'Invalid stage.' });
      data.stage = stage;
    }
    if (typeof req.body?.notes === 'string') data.notes = req.body.notes.slice(0, 4000);
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'expectedDealValueCents')) {
      const value = req.body.expectedDealValueCents;
      if (value === null || value === '') data.expectedDealValueCents = null;
      else if (!Number.isInteger(value) || value < 0 || value > 100000000000) {
        return res.status(400).json({ error: 'Expected deal value must be a non-negative whole number of cents.' });
      } else data.expectedDealValueCents = value;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'expectedMarginPercent')) {
      const margin = Number(req.body.expectedMarginPercent);
      if (!Number.isFinite(margin) || margin < 0 || margin > 100) {
        return res.status(400).json({ error: 'Expected marketplace margin must be between 0 and 100 percent.' });
      }
      data.expectedMarginPercent = margin;
    }
    if (req.body?.nextFollowUpAt === null) data.nextFollowUpAt = null;
    else if (typeof req.body?.nextFollowUpAt === 'string') {
      const date = new Date(req.body.nextFollowUpAt);
      if (!Number.isFinite(date.getTime())) return res.status(400).json({ error: 'Invalid follow-up date.' });
      data.nextFollowUpAt = date;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No valid lead fields supplied.' });
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: {
      ...data, ...(data.stage === 'CONTACTED' ? { lastContactedAt: new Date() } : {}),
      ...(data.stage && data.stage !== lead.stage ? { activities: { create: { type: 'stage_changed', description: `Stage changed to ${data.stage}.` } } } : {}),
    } });
    return res.json({ lead: updated });
  });

  router.get('/sales', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const where = user.role === 'admin' ? {} : { ownerId: user.id };
    const grouped = await prisma.lead.groupBy({ by: ['stage'], where, _count: { _all: true } });
    const counts = Object.fromEntries(stages.map((stage) => [stage, 0])) as Record<string, number>;
    grouped.forEach((item) => { counts[item.stage] = item._count._all; });
    const followUpsDue = await prisma.lead.count({ where: { ...where, nextFollowUpAt: { lte: new Date() }, stage: { notIn: ['WON', 'LOST'] } } });
    return res.json({ stages: counts, totalLeads: Object.values(counts).reduce((a, b) => a + b, 0), followUpsDue });
  });

  // Revenue node: only database orders explicitly marked PAID are counted as sales.
  // Lead award amounts and pipeline stages are intentionally excluded from revenue.
  router.get('/revenue', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const orderScope = user.role === 'admin'
      ? {}
      : user.role === 'seller'
        ? { dataset: { sellerId: user.id } }
        : { buyerId: user.id };
    const nonDemoOrderFilter = {
      buyer: { isNot: { email: { endsWith: '@local.test' } } },
      dataset: {
        is: {
          seller: { isNot: { email: { endsWith: '@local.test' } } },
          title: { not: { contains: '(Sample)' } },
        },
      },
    };
    const orderWhere = { AND: [orderScope, nonDemoOrderFilter] };
    const paidOrderWhere = { AND: [orderScope, nonDemoOrderFilter, { status: 'PAID' as const }] };
    const leadWhere = user.role === 'admin' ? {} : { ownerId: user.id };

    try {
      const [paidValue, paidOrders, orderStatuses, leadStages, followUpsDue] = await Promise.all([
        prisma.order.aggregate({ where: paidOrderWhere, _sum: { totalCents: true } }),
        prisma.order.count({ where: paidOrderWhere }),
        prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ['stage'], where: leadWhere, _count: { _all: true } }),
        prisma.lead.count({
          where: { ...leadWhere, nextFollowUpAt: { lte: new Date() }, stage: { notIn: ['WON', 'LOST'] } },
        }),
      ]);

      const orderCounts = { pending: 0, paid: 0, failed: 0, refunded: 0 };
      for (const item of orderStatuses) orderCounts[item.status.toLowerCase() as keyof typeof orderCounts] = item._count._all;
      const stageCounts = Object.fromEntries(stages.map((stage) => [stage, 0])) as Record<string, number>;
      for (const item of leadStages) stageCounts[item.stage] = item._count._all;

      return res.json({
        source: 'database',
        updatedAt: new Date().toISOString(),
        currency: 'USD',
        actualPaidOrderValueCents: paidValue._sum.totalCents ?? 0,
        actualPaidOrders: paidOrders,
        orderCounts,
        leadStages: stageCounts,
        totalLeads: Object.values(stageCounts).reduce((sum, count) => sum + count, 0),
        openLeads: stageCounts.NEW + stageCounts.QUALIFIED + stageCounts.CONTACTED + stageCounts.PROPOSAL,
        proposals: stageCounts.PROPOSAL,
        closedWonLeads: stageCounts.WON,
        followUpsDue,
        revenueDefinition: 'Database orders marked PAID, excluding local test accounts and sample datasets. This is not processor settlement or net revenue.',
        pipelineDefinition: 'Lead counts are workflow activity only. Supplier award amounts are not sales or forecast revenue.',
      });
    } catch (error) {
      console.error('Revenue pipeline summary failed', error);
      return res.status(500).json({ error: 'Unable to load revenue pipeline figures.' });
    }
  });

  return router;
}

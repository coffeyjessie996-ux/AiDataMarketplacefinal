import express from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };
const stages = ['NEW', 'QUALIFIED', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'] as const;

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
    return res.json({ count: leads.length, leads });
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
      const sourceKey = `usaspending.gov:${record.sourceRecordId}:${user.id}`;
      await prisma.lead.upsert({
        where: { sourceKey },
        create: { id: randomUUID(), ownerId: user.id, source: 'usaspending.gov', sourceRecordId: record.sourceRecordId,
          sourceKey, companyName: name, awardAmount: record.awardAmount ?? undefined, score,
          activities: { create: { type: 'imported', description: 'Imported from saved USAspending.gov research.' } } },
        update: {},
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

  return router;
}

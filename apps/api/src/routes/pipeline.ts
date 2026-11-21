import express from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };
const stages = ['NEW', 'QUALIFIED', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'] as const;
const isExternalWorkOpportunity = (source: string) => source === 'Remote OK' || source === 'SAM.gov';
const stageCloseProbability: Record<(typeof stages)[number], number> = {
  NEW: 5, QUALIFIED: 15, CONTACTED: 25, PROPOSAL: 50, WON: 100, LOST: 0,
};

function calculateLeadPriority(input: {
  companyName?: string | null; source?: string | null; awardAmount?: unknown;
  description?: string | null; contactName?: string | null; email?: string | null; website?: string | null;
}) {
  const description = input.description || '';
  const checks = [
    { label: 'Company identified', points: 10, complete: Boolean(input.companyName?.trim()) },
    { label: 'Award amount available', points: 5, complete: input.awardAmount !== null && input.awardAmount !== undefined && Number.isFinite(Number(input.awardAmount)) },
    { label: 'Awarding agency available', points: 5, complete: /Agency:\s*[^•]+/i.test(description) },
    { label: 'NAICS classification available', points: 5, complete: /NAICS:\s*[^•]+/i.test(description) },
    { label: 'UEI available', points: 10, complete: /UEI:\s*[^•]+/i.test(description) },
    { label: 'Award description available', points: 5, complete: /Award description:\s*[^•]+/i.test(description) },
    { label: 'Performance location available', points: 5, complete: /Performance state:\s*[^•]+/i.test(description) },
    { label: 'Start date available', points: 5, complete: /Start date:\s*[^•]+/i.test(description) },
    { label: 'End date available', points: 5, complete: /End date:\s*[^•]+/i.test(description) },
    { label: 'Email contact available', points: 20, complete: Boolean(input.email?.trim()) },
    { label: 'Company website available', points: 10, complete: Boolean(input.website?.trim()) },
    { label: 'Named contact available', points: 10, complete: Boolean(input.contactName?.trim()) },
    { label: 'Source identified', points: 5, complete: Boolean(input.source?.trim()) },
  ];
  let score = checks.reduce((total, check) => total + (check.complete ? check.points : 0), 0);
  const hasDirectContact = Boolean(input.email?.trim() || input.website?.trim() || input.contactName?.trim());
  if (!hasDirectContact) score = Math.min(score, 59);
  return { score: Math.min(100, score), priorityReasons: checks.filter((check) => check.complete).map((check) => check.label),
    priorityBlockers: [
      ...(!input.email?.trim() ? ['No email address on record'] : []),
      ...(!input.website?.trim() ? ['No company website on record'] : []),
      ...(!input.contactName?.trim() ? ['No named contact on record'] : []),
      ...(!hasDirectContact ? ['Score capped until a direct contact path is found'] : []),
    ] };
}
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
      return { ...lead, ...calculateLeadPriority(lead), expectedMarginPercent, closeProbabilityPercent, predictedProfitCents };
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
      const contactName = value('contactName', 'contact_name', 'recipientContactName');
      const email = value('email', 'contactEmail', 'recipientEmail');
      const website = value('website', 'companyWebsite', 'recipientWebsite');
      const priority = calculateLeadPriority({ companyName: name, source: record.source, awardAmount: record.awardAmount, description, contactName, email, website });
      const score = priority.score;
      const sourceKey = `usaspending.gov:${record.sourceRecordId}:${user.id}`;
      await prisma.lead.upsert({
        where: { sourceKey },
        create: { id: randomUUID(), ownerId: user.id, source: 'usaspending.gov', sourceRecordId: record.sourceRecordId,
          sourceKey, companyName: name, awardAmount: record.awardAmount ?? undefined, score, description,
          contactName: contactName || null, email: email || null, website: website || null,
          activities: { create: { type: 'imported', description: 'Imported and enriched from saved USAspending.gov award details.' } } },
        update: { sourceRecordId: record.sourceRecordId, awardAmount: record.awardAmount ?? undefined, score, description,
          contactName: contactName || undefined, email: email || undefined, website: website || undefined },
      });
      imported++;
    }
    return res.json({ source: 'USAspending.gov', recordsReviewed: records.length, leadsCreatedOrExisting: imported,
      note: 'Priority reflects public-record completeness and contactability, not supplier verification or predicted conversion. Records without an email, website, or named contact are capped at 59.' });
  });

  // Import only buyer inquiries where the visitor explicitly consented to follow-up.
  // Supplier records and anonymous searches are not treated as buyer prospects.
  router.post('/leads/import-buyer-inquiries', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const inquiries = await prisma.buyerDemandEvent.findMany({
        where: { contactConsentAt: { not: null }, buyerEmail: { not: null }, status: { in: ['NEW', 'CONTACTED'] } },
        orderBy: { createdAt: 'desc' }, take: 300,
      });
      let imported = 0;
      for (const inquiry of inquiries) {
        const email = inquiry.buyerEmail?.trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        const companyName = inquiry.companyName?.trim() || inquiry.buyerName?.trim() || email;
        const description = [
          inquiry.interest ? `Buyer-requested interest: ${inquiry.interest}` : '',
          inquiry.message ? `Buyer message: ${inquiry.message.slice(0, 1800)}` : '',
          'This contact submitted a marketplace inquiry and consented to follow-up.',
        ].filter(Boolean).join(' • ').slice(0, 2500);
        const sourceKey = `buyer-inquiry:${inquiry.id}:${user.id}`;
        const priority = calculateLeadPriority({ companyName, source: 'buyer-inquiry', description, contactName: inquiry.buyerName, email });
        await prisma.lead.upsert({
          where: { sourceKey },
          create: {
            id: randomUUID(), ownerId: user.id, source: 'buyer-inquiry', sourceRecordId: inquiry.id,
            sourceKey, companyName: companyName.slice(0, 200), contactName: inquiry.buyerName?.slice(0, 160) ?? null,
            email, description, score: priority.score,
            activities: { create: { type: 'buyer_inquiry_imported', description: 'Imported from a buyer inquiry with recorded follow-up consent.' } },
          },
          update: { companyName: companyName.slice(0, 200), contactName: inquiry.buyerName?.slice(0, 160) ?? null, email, description, score: priority.score },
        });
        imported++;
      }
      return res.json({ source: 'consented buyer inquiries', inquiriesReviewed: inquiries.length, leadsCreatedOrExisting: imported, note: 'Only inquiries with a recorded contact-consent timestamp and email are imported. No email is sent automatically.' });
    } catch (error) {
      console.error('Consented buyer inquiry import failed', error);
      return res.status(500).json({ error: 'Unable to import consented buyer inquiries.' });
    }
  });

  // AI sales assistant: create an evidence-based outreach draft for human review.
  // It never sends email or changes a lead's stage automatically.
  router.post('/leads/:id/ai-draft', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...(user.role === 'admin' ? {} : { ownerId: user.id }) },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (isExternalWorkOpportunity(lead.source)) {
      return res.status(409).json({ error: 'This is a public work opportunity, not a sales prospect. Review the original listing and apply or respond directly through its official process.' });
    }
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI sales assistant is not configured. Add OPENAI_API_KEY to the API environment.' });

    const taskId = randomUUID();
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 550,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are an ethical B2B sales enablement assistant. Use only supplied facts. Never invent a contact, email, relationship, product capability, buyer intent, or claim. If there is no verified contact email, explicitly say the draft must not be sent until a contact is independently verified. Return JSON with subject, emailBody, rationale, missingInformation, suggestedNextStep. Write concise, relevant, non-deceptive outreach. Do not claim an existing relationship.' },
            { role: 'user', content: JSON.stringify({ companyName: lead.companyName, contactName: lead.contactName, verifiedEmail: lead.email, website: lead.website, source: lead.source, publicRecordDescription: lead.description, awardAmount: lead.awardAmount?.toString() ?? null, currentStage: lead.stage, operatorNotes: lead.notes }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = payload.choices?.[0]?.message?.content;
      if (!raw) throw new Error('AI returned an empty draft.');
      const draft = JSON.parse(raw) as Record<string, unknown>;
      const subject = typeof draft.subject === 'string' ? draft.subject.slice(0, 180) : '';
      const emailBody = typeof draft.emailBody === 'string' ? draft.emailBody.slice(0, 5000) : '';
      if (!subject || !emailBody) throw new Error('AI returned an incomplete draft.');
      const safeDraft = {
        subject, emailBody,
        rationale: typeof draft.rationale === 'string' ? draft.rationale.slice(0, 700) : '',
        missingInformation: Array.isArray(draft.missingInformation) ? draft.missingInformation.filter((v): v is string => typeof v === 'string').slice(0, 8) : [],
        suggestedNextStep: typeof draft.suggestedNextStep === 'string' ? draft.suggestedNextStep.slice(0, 400) : 'Verify a relevant contact before sending.',
        requiresHumanReview: true,
        sendStatus: 'DRAFT_ONLY',
      };
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: 'ai_outreach_draft', description: JSON.stringify(safeDraft) },
      });
      return res.json({ leadId: lead.id, draft: safeDraft });
    } catch (error) {
      console.error('AI sales draft failed', error);
      return res.status(502).json({ error: 'Unable to generate an outreach draft. No message was sent.' });
    }
  });


  // AI deal closer: prepare an evidence-based close plan for human review.
  // It does not contact prospects, create offers, or mark deals as won.
  router.post('/leads/:id/close-plan', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...(user.role === 'admin' ? {} : { ownerId: user.id }) },
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (isExternalWorkOpportunity(lead.source)) {
      return res.status(409).json({ error: 'This is a public work opportunity, not a sales prospect. Review the original listing and follow its official application or bid process.' });
    }
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI deal closer is not configured. Add OPENAI_API_KEY to the API environment.' });

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 650,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are an ethical B2B deal-closer coach. Analyze only supplied evidence. Never invent buyer intent, budget, authority, deadlines, objections, product capabilities, pricing, commitments, or relationship history. Clearly label unknowns. Do not pressure, deceive, or imply a deal is ready to close without evidence. Return JSON with dealReadiness (one of NOT_READY, NEEDS_DISCOVERY, PROPOSAL_READY, DECISION_PENDING), qualificationGaps (array of strings), likelyObjections (array of objects with objection and evidenceBasedResponse strings), closingPlan (array of strings), suggestedCloseMessage (string), nextBestAction (string), confidenceNote (string). Keep the plan practical and respectful.' },
            { role: 'user', content: JSON.stringify({
              companyName: lead.companyName, contactName: lead.contactName, verifiedEmail: lead.email,
              website: lead.website, source: lead.source, publicRecordDescription: lead.description,
              awardAmount: lead.awardAmount?.toString() ?? null, currentStage: lead.stage,
              operatorNotes: lead.notes,
              recentActivity: lead.activities.map((a) => ({ type: a.type, description: a.description.slice(0, 1000), createdAt: a.createdAt })),
            }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = payload.choices?.[0]?.message?.content;
      if (!raw) throw new Error('AI returned an empty close plan.');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const allowedReadiness = ['NOT_READY', 'NEEDS_DISCOVERY', 'PROPOSAL_READY', 'DECISION_PENDING'];
      const safePlan = {
        dealReadiness: typeof parsed.dealReadiness === 'string' && allowedReadiness.includes(parsed.dealReadiness) ? parsed.dealReadiness : 'NEEDS_DISCOVERY',
        qualificationGaps: Array.isArray(parsed.qualificationGaps) ? parsed.qualificationGaps.filter((v): v is string => typeof v === 'string').slice(0, 8) : [],
        likelyObjections: Array.isArray(parsed.likelyObjections) ? parsed.likelyObjections.slice(0, 6).map((v) => {
          const item = v && typeof v === 'object' ? v as Record<string, unknown> : {};
          return { objection: typeof item.objection === 'string' ? item.objection.slice(0, 300) : 'Unknown objection', evidenceBasedResponse: typeof item.evidenceBasedResponse === 'string' ? item.evidenceBasedResponse.slice(0, 600) : 'Ask a clarifying question before responding.' };
        }) : [],
        closingPlan: Array.isArray(parsed.closingPlan) ? parsed.closingPlan.filter((v): v is string => typeof v === 'string').slice(0, 8) : [],
        suggestedCloseMessage: typeof parsed.suggestedCloseMessage === 'string' ? parsed.suggestedCloseMessage.slice(0, 2500) : '',
        nextBestAction: typeof parsed.nextBestAction === 'string' ? parsed.nextBestAction.slice(0, 500) : 'Verify the decision process and buyer requirements.',
        confidenceNote: typeof parsed.confidenceNote === 'string' ? parsed.confidenceNote.slice(0, 500) : 'Based only on the information currently saved for this lead.',
        requiresHumanReview: true,
        status: 'PLAN_ONLY_NOT_SENT',
      };
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: 'ai_close_plan', description: JSON.stringify(safePlan) },
      });
      return res.json({ leadId: lead.id, closePlan: safePlan });
    } catch (error) {
      console.error('AI deal close plan failed', error);
      return res.status(502).json({ error: 'Unable to generate a deal close plan. No message was sent and the lead stage was not changed.' });
    }
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


  // Turn an explicitly consented buyer inquiry into a one-time, seller-priced Stripe checkout.
  // The seller chooses the amount; only the Stripe webhook can record the service as paid.
  router.post('/buyer-inquiries/:id/checkout', async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Seller or administrator access is required.' });
    }
    if (process.env.STRIPE_CHECKOUT_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Service checkout is not enabled.' });
    }
    const parsed = z.object({
      amountCents: z.number().int().min(500).max(1_000_000),
      proposalDescription: z.string().trim().min(20).max(1000),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a price between $5 and $10,000 and describe the deliverables (at least 20 characters).' });

    const isPreview = process.env.VERCEL_ENV === 'preview';
    const secretKey = isPreview ? process.env.STRIPE_SECRET_TEST_KEY : process.env.STRIPE_SECRET_KEY;
    if (!secretKey || (isPreview && !secretKey.startsWith('sk_test_')) ||
        (process.env.VERCEL_ENV === 'production' && !secretKey.startsWith('sk_live_'))) {
      return res.status(503).json({ error: 'A matching Stripe key is not configured for this environment.' });
    }

    try {
      const inquiry = await prisma.buyerDemandEvent.findFirst({
        where: {
          id: String(req.params.id),
          contactConsentAt: { not: null },
          buyerEmail: { not: null },
          status: { in: ['NEW', 'CONTACTED'] },
        },
      });
      if (!inquiry?.buyerEmail) return res.status(404).json({ error: 'A contactable, open buyer inquiry was not found.' });

      const ownerId = user.id;
      const sourceKey = `buyer-inquiry:${inquiry.id}:${ownerId}`;
      const companyName = inquiry.companyName?.trim() || inquiry.buyerName?.trim() || inquiry.buyerEmail;
      const lead = await prisma.lead.upsert({
        where: { sourceKey },
        create: {
          ownerId, source: 'buyer-inquiry', sourceRecordId: inquiry.id, sourceKey,
          companyName: companyName.slice(0, 200),
          contactName: inquiry.buyerName?.slice(0, 160) ?? null,
          email: inquiry.buyerEmail.toLowerCase(),
          description: [inquiry.interest ? `Requested service: ${inquiry.interest}` : '', inquiry.message || ''].filter(Boolean).join(' • ').slice(0, 2400),
          notes: 'Buyer submitted this inquiry and explicitly consented to follow-up. Service checkout is a seller-priced quote; deliverables and timing must be agreed before work begins.',
          activities: { create: { type: 'buyer_inquiry_imported', description: 'Created from a buyer inquiry with recorded follow-up consent.' } },
        },
        update: {},
      });
      if (lead.email?.toLowerCase() !== inquiry.buyerEmail.toLowerCase()) {
        return res.status(409).json({ error: 'The saved buyer lead does not match the consented inquiry email.' });
      }

      const labels: Record<string, string> = {
        'supplier-intelligence': 'Supplier intelligence research',
        'engineering-awards': 'Engineering awards research',
        'agency-trends': 'Agency and market trends research',
        'custom-research': 'Custom business research',
        'weather-planning': 'Weather planning research',
        'supplier-monitoring': 'Supplier monitoring service',
        'data-cleaning': 'Customer-authorized data cleaning',
        'rfp-intelligence': 'RFP and contract intelligence research',
        'business-reports': 'Industry and business report',
        'data-api': 'Business data access service',
        'workflow-automation': 'Business workflow automation service',
        'white-label-intelligence': 'White-label intelligence report',
      };
      const serviceName = labels[inquiry.interest || ''] || 'Custom business research service';
      const amountCents = parsed.data.amountCents;
      const stripe = new Stripe(secretKey);
      const previous = await prisma.leadActivity.findFirst({
        where: { leadId: lead.id, type: 'service_checkout_created' },
        orderBy: { createdAt: 'desc' },
      });
      if (previous) {
        try {
          const previousData = JSON.parse(previous.description) as { sessionId?: string; amountCents?: number };
          if (previousData.sessionId && previousData.amountCents === amountCents) {
            const existing = await stripe.checkout.sessions.retrieve(previousData.sessionId);
            if (existing.status === 'open' && existing.url) {
              return res.json({ checkoutUrl: existing.url, reused: true, amountCents, currency: 'USD' });
            }
          }
        } catch { /* Expired or unavailable session: create a fresh idempotent checkout. */ }
      }

      const baseUrl = (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: inquiry.buyerEmail.toLowerCase(),
        client_reference_id: lead.id,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: serviceName.slice(0, 250),
              description: parsed.data.proposalDescription.slice(0, 500),
            },
          },
        }],
        metadata: {
          kind: 'service_request',
          leadId: lead.id,
          sellerId: ownerId,
          inquiryId: inquiry.id,
          serviceKey: inquiry.interest || 'custom-research',
          amountCents: String(amountCents),
        },
        success_url: `${baseUrl}/service-checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/for-businesses?checkout=cancelled`,
      }, { idempotencyKey: `service-checkout-${lead.id}-${amountCents}-${randomUUID()}` });
      if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id, type: 'service_checkout_created',
          description: JSON.stringify({ sessionId: session.id, amountCents, serviceKey: inquiry.interest || 'custom-research', proposalDescription: parsed.data.proposalDescription, createdAt: new Date().toISOString() }),
        },
      });
      return res.status(201).json({ checkoutUrl: session.url, amountCents, currency: 'USD', status: 'pending' });
    } catch (error) {
      console.error('Service checkout creation failed', error);
      return res.status(502).json({ error: 'Unable to create service checkout. No payment was confirmed.' });
    }
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

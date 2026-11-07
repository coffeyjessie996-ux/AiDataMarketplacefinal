import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { finishAgentTask, startAgentTask } from '../services/agent-activity';

const SOURCE_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

function authorized(requestHeader: string | undefined, secret: string): boolean {
  if (!requestHeader?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(requestHeader.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Best-effort per-instance throttle for the serverless cron endpoint.
// The bearer secret remains the primary access control; this limits repeated requests
// handled by the same warm instance without relying on client-supplied identity headers.
const samOpportunityRequestWindows = new Map<string, { startedAt: number; count: number }>();

function allowSamOpportunityRequest(key: string, now = Date.now()): boolean {
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 3;
  for (const [entryKey, window] of samOpportunityRequestWindows) {
    if (now - window.startedAt >= windowMs) samOpportunityRequestWindows.delete(entryKey);
  }
  const current = samOpportunityRequestWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    if (samOpportunityRequestWindows.size >= 500) samOpportunityRequestWindows.clear();
    samOpportunityRequestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= maxRequests) return false;
  current.count += 1;
  return true;
}

export function createCronRouter(prisma: PrismaClient) {
  const router = Router();

  // Vercel Cron calls this daily. It stores public award research only; it does
  // not create leads, publish products, send email, or count awards as revenue.
  router.get('/research/federal-awards', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Scheduled research is not configured: CRON_SECRET is missing.' });
    }
    if (!authorized(req.headers.authorization, secret)) {
      return res.status(401).json({ error: 'Unauthorized scheduled research request.' });
    }

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 90);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const retrievedAt = new Date();
    const taskId = await startAgentTask(prisma, 'USAspending collector', 'Collect recent federal award records');

    try {
      const response = await fetch(SOURCE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          filters: {
            time_period: [{ start_date: startDate, end_date: endDate }],
            award_type_codes: ['A', 'B', 'C', 'D'],
          },
          fields: [
            'Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date',
            'Awarding Agency', 'Description', 'Place of Performance State Code', 'NAICS', 'Recipient UEI', 'generated_internal_id',
          ],
          page: 1,
          limit: 100,
          sort: 'Award Amount',
          order: 'desc',
        }),
      });

      if (!response.ok) {
        await finishAgentTask(prisma, taskId, 'FAILED', { message: `USAspending.gov returned HTTP ${response.status}.` });
        return res.status(502).json({
          error: 'USAspending.gov returned an error.',
          sourceStatus: response.status,
        });
      }

      const payload = await response.json() as { results?: Array<Record<string, unknown>> };
      const rows = Array.isArray(payload.results) ? payload.results : [];
      let saved = 0;
      let skipped = 0;

      for (const row of rows) {
        const awardId = String(row['Award ID'] ?? row.award_id ?? '').trim();
        if (!awardId) {
          skipped += 1;
          continue;
        }

        const supplierName = row['Recipient Name'] ?? row.recipient_name;
        const rawAmount = row['Award Amount'] ?? row.award_amount;
        const amount = Number(rawAmount);
        const generatedAwardId = String(row.generated_internal_id ?? '').trim();
        const awardUrl = generatedAwardId
          ? `https://www.usaspending.gov/award/${encodeURIComponent(generatedAwardId)}`
          : 'https://www.usaspending.gov/search';

        const record = {
          awardId,
          generatedAwardId: generatedAwardId || null,
          supplierName: supplierName ?? null,
          awardAmount: rawAmount ?? null,
          startDate: row['Start Date'] ?? row.start_date ?? null,
          endDate: row['End Date'] ?? row.end_date ?? null,
          awardingAgency: row['Awarding Agency'] ?? row.awarding_agency_name ?? null,
          description: row.Description ?? row.description ?? null,
          performanceState: row['Place of Performance State Code'] ?? row.place_of_performance_state_code ?? null,
          naics: row.NAICS ?? row.naics ?? null,
          supplierUei: row['Recipient UEI'] ?? row.recipient_uei ?? null,
          sourceUrl: awardUrl,
          retrievedAt: retrievedAt.toISOString(),
        };

        await prisma.supplierResearchRecord.upsert({
          where: {
            source_sourceRecordId: {
              source: 'usaspending.gov',
              sourceRecordId: awardId,
            },
          },
          create: {
            source: 'usaspending.gov',
            sourceRecordId: awardId,
            supplierName: typeof supplierName === 'string' ? supplierName : null,
            awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
            sourceUrl: record.sourceUrl,
            payload: JSON.parse(JSON.stringify(record)),
            retrievedAt,
          },
          update: {
            supplierName: typeof supplierName === 'string' ? supplierName : null,
            awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
            sourceUrl: record.sourceUrl,
            payload: JSON.parse(JSON.stringify(record)),
            retrievedAt,
          },
        });
        saved += 1;
      }

      await finishAgentTask(prisma, taskId, 'COMPLETED', {
        message: `USAspending collection completed: ${saved} records saved, ${skipped} skipped.`,
        recordsFetched: rows.length, recordsSaved: saved, recordsFailed: skipped,
      });
      return res.json({
        ok: true,
        source: 'USAspending.gov',
        retrievedAt: retrievedAt.toISOString(),
        dateRange: { startDate, endDate },
        fetched: rows.length,
        saved,
        skipped,
        note: 'Daily refresh of up to 100 high-value public award records from the last 90 days. These are supplier-research records, not verified contacts, sales, or marketplace revenue.',
      });
    } catch (error) {
      await finishAgentTask(prisma, taskId, 'FAILED', { message: 'USAspending collection failed before completion.' });
      console.error('Scheduled USAspending refresh failed', error);
      return res.status(502).json({ error: 'Scheduled supplier research refresh failed.' });
    }
  });

  // Daily SAM.gov opportunity refresh. This captures public solicitation research
  // separately from supplier award records; agency POC details are not marketing leads.
  router.get('/research/sam-opportunities', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const apiKey = process.env.SAM_API_KEY;
    if (!secret) return res.status(503).json({ error: 'Scheduled research is not configured: CRON_SECRET is missing.' });
    if (!authorized(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized scheduled research request.' });
    if (!allowSamOpportunityRequest(req.ip || 'unknown')) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ error: 'Too many SAM.gov research requests. Try again later.' });
    }
    if (!apiKey) return res.status(503).json({ error: 'SAM.gov research is not configured: SAM_API_KEY is missing.' });
    const taskId = await startAgentTask(prisma, 'SAM.gov collector', 'Collect public federal opportunity notices');

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
    const samDate = (date: Date) => {
      const [year, month, day] = date.toISOString().slice(0, 10).split('-');
      return `${month}/${day}/${year}`;
    };
    const retrievedAt = new Date();
    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom: samDate(start),
      postedTo: samDate(end),
      limit: '100',
      offset: '0',
    });
    params.append('ptype', 'o');
    params.append('ptype', 'k');
    params.append('ptype', 'r');

    try {
      const response = await fetch(`https://api.sam.gov/prod/opportunities/v2/search?${params.toString()}`, {
        headers: { accept: 'application/json', 'user-agent': 'AI-Data-Marketplace/1.0 (public federal opportunity research)' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 404) {
        // The official Get Opportunities API documents HTTP 404 as "No Data found".
        // Treat an empty search window as a successful zero-result collection, not an outage.
        await finishAgentTask(prisma, taskId, 'COMPLETED', {
          message: 'SAM.gov returned HTTP 404 (no matching opportunities for this search window).',
          recordsFetched: 0,
          recordsSaved: 0,
          recordsFailed: 0,
        });
        return res.json({
          ok: true,
          source: 'SAM.gov Get Opportunities Public API',
          retrievedAt: retrievedAt.toISOString(),
          dateRange: { startDate: samDate(start), endDate: samDate(end) },
          totalMatchingOpportunities: 0,
          fetched: 0,
          saved: 0,
          skipped: 0,
          note: 'SAM.gov reported no matching opportunities for this date range and notice-type filter. This is an empty result, not a collector outage.',
        });
      }

      if (!response.ok) {
        await finishAgentTask(prisma, taskId, 'FAILED', { message: `SAM.gov returned HTTP ${response.status}.` });
        return res.status(502).json({ error: 'SAM.gov returned an error.', sourceStatus: response.status });
      }

      const result = await response.json() as {
        totalRecords?: number;
        opportunitiesData?: Array<Record<string, unknown>>;
      };
      const rows = Array.isArray(result.opportunitiesData) ? result.opportunitiesData : [];
      let saved = 0;
      let skipped = 0;

      const getObject = (value: unknown): Record<string, unknown> =>
        value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const asText = (value: unknown): string | null =>
        typeof value === 'string' && value.trim() ? value.trim() : null;

      for (let index = 0; index < rows.length; index += 20) {
        const batch = rows.slice(index, index + 20);
        const outcomes = await Promise.all(batch.map(async (row) => {
          const noticeId = asText(row.noticeId);
          if (!noticeId) return false;
          const award = getObject(row.award);
          const awardee = getObject(award.awardee);
          const rawAwardAmount = typeof award.amount === 'number'
            ? award.amount
            : typeof award.amount === 'string' && award.amount.trim() !== ''
              ? Number(award.amount)
              : Number.NaN;
          const normalizedAwardAmount = Number.isFinite(rawAwardAmount) && rawAwardAmount >= 0
            ? rawAwardAmount
            : null;
          const opportunityUrl = asText(row.uiLink);
          const sourceUrl = opportunityUrl && /^https:\/\//i.test(opportunityUrl)
            ? opportunityUrl
            : 'https://sam.gov/';
          const payload = JSON.parse(JSON.stringify({
            recordType: 'federal_contract_opportunity',
            noticeId,
            title: asText(row.title),
            solicitationNumber: asText(row.solicitationNumber),
            department: asText(row.department),
            subTier: asText(row.subTier),
            postedDate: asText(row.postedDate),
            type: asText(row.type),
            responseDeadline: asText(row.responseDeadLine ?? row.responseDeadline),
            naicsCode: asText(row.naicsCode),
            classificationCode: asText(row.classificationCode),
            setAside: asText(row.typeOfSetAsideDescription),
            award: Object.keys(award).length ? award : null,
            pointOfContact: Array.isArray(row.pointOfContact) ? row.pointOfContact : null,
            placeOfPerformance: row.placeOfPerformance ?? null,
            sourceUrl,
            retrievedAt: retrievedAt.toISOString(),
          }));
          await prisma.supplierResearchRecord.upsert({
            where: { source_sourceRecordId: { source: 'sam.gov_opportunities', sourceRecordId: noticeId } },
            create: {
              source: 'sam.gov_opportunities',
              sourceRecordId: noticeId,
              supplierName: asText(awardee.name),
              awardAmount: normalizedAwardAmount,
              sourceUrl,
              payload,
              retrievedAt,
            },
            update: {
              supplierName: asText(awardee.name),
              awardAmount: normalizedAwardAmount,
              sourceUrl,
              payload,
              retrievedAt,
            },
          });
          return true;
        }));
        saved += outcomes.filter(Boolean).length;
        skipped += outcomes.length - outcomes.filter(Boolean).length;
      }

      await finishAgentTask(prisma, taskId, 'COMPLETED', {
        message: `SAM.gov collection completed: ${saved} opportunity records saved, ${skipped} skipped.`,
        recordsFetched: rows.length, recordsSaved: saved, recordsFailed: skipped,
      });
      return res.json({
        ok: true,
        source: 'SAM.gov Get Opportunities Public API',
        retrievedAt: retrievedAt.toISOString(),
        dateRange: { startDate: samDate(start), endDate: samDate(end) },
        totalMatchingOpportunities: Number(result.totalRecords ?? rows.length),
        fetched: rows.length,
        saved,
        skipped,
        note: 'Public solicitation research only. Government points of contact are not sales leads; these records are not supplier verification or marketplace revenue.',
      });
    } catch (error) {
      await finishAgentTask(prisma, taskId, 'FAILED', { message: 'SAM.gov collection failed before completion.' });
      console.error('Scheduled SAM.gov opportunity refresh failed', error);
      return res.status(502).json({ error: 'Scheduled SAM.gov opportunity refresh failed.' });
    }
  });

  return router;
}

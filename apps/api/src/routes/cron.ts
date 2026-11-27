import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { finishAgentTask, startAgentTask } from '../services/agent-activity';
import { reconcileStaleAgentTasks } from '../services/maintenance';
import { upsertResearchRecordPreservingAnalysis } from '../services/research-records';

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

// Per-instance rate limit for the maintenance cron route. CRON_SECRET remains
// the authentication control; this additionally caps repeated requests per IP.
const maintenanceRequestWindows = new Map<string, { startedAt: number; count: number }>();

function allowMaintenanceRequest(ip: string, now = Date.now()): boolean {
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 3;
  for (const [entryIp, window] of maintenanceRequestWindows) {
    if (now - window.startedAt >= windowMs) maintenanceRequestWindows.delete(entryIp);
  }
  const current = maintenanceRequestWindows.get(ip);
  if (!current || now - current.startedAt >= windowMs) {
    if (maintenanceRequestWindows.size >= 500) maintenanceRequestWindows.clear();
    maintenanceRequestWindows.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= maxRequests) return false;
  current.count += 1;
  return true;
}

function safeSamResponseMessage(body: string, apiKey: string): string {
  return body
    .replaceAll(apiKey, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key[\"'\s:=]+)[^\s,\"']+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

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
      const rows: Array<Record<string, unknown>> = [];
      let pagesFetched = 0;
      for (const page of [1, 2, 3]) {
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
            page,
            limit: 100,
            sort: 'Award Amount',
            order: 'desc',
          }),
        });

        if (!response.ok) {
          await finishAgentTask(prisma, taskId, 'FAILED', {
            message: `USAspending.gov returned HTTP ${response.status} while fetching page ${page}.`,
            recordsFetched: rows.length,
            recordsFailed: 1,
          });
          return res.status(502).json({
            error: 'USAspending.gov returned an error.',
            sourceStatus: response.status,
            pagesFetched,
            fetchedBeforeError: rows.length,
          });
        }

        const payload = await response.json() as { results?: Array<Record<string, unknown>> };
        const pageRows = Array.isArray(payload.results) ? payload.results : [];
        pagesFetched += 1;
        rows.push(...pageRows);
        if (pageRows.length < 100) break;
      }
      let saved = 0;
      let skipped = 0;

      // Preserve analysis written by the AI research task when refreshing source fields.
      // A plain payload replacement here would silently erase that analysis on every
      // subsequent USAspending collection run.
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

        await upsertResearchRecordPreservingAnalysis(prisma, {
          source: 'usaspending.gov',
          sourceRecordId: awardId,
          supplierName: typeof supplierName === 'string' ? supplierName : null,
          awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
          sourceUrl: record.sourceUrl,
          payload: record,
          retrievedAt,
        });
        saved += 1;
      }

      await finishAgentTask(prisma, taskId, 'COMPLETED', {
        message: `USAspending collection completed: ${saved} records saved, ${skipped} skipped across ${pagesFetched} pages.`,
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
        pagesFetched,
        note: 'Daily refresh of up to 300 high-value public award records from the last 90 days. These are supplier-research records, not verified contacts, sales, or marketplace revenue.',
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
    if (process.env.SAM_OPPORTUNITY_RESEARCH_ENABLED !== 'true') {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'SAM.gov opportunity collection is paused until API authorization and source-specific redistribution terms are reviewed.',
      });
    }
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
      const responseBody = await response.text();
      const diagnostic = safeSamResponseMessage(responseBody, apiKey);
      const looksLikeCredentialFailure = /invalid.{0,20}(api[ -]?key|credential)|missing.{0,20}(api[ -]?key|credential)|unauthori[sz]ed|forbidden|api[ -]?key.{0,20}(invalid|missing|expired)/i.test(diagnostic);

      if (response.status === 404 && !looksLikeCredentialFailure) {
        // GSA documents HTTP 404 as "No Data found". Preserve empty-result handling,
        // but retain a short sanitized response diagnostic for source verification.
        await finishAgentTask(prisma, taskId, 'COMPLETED', {
          message: diagnostic
            ? `SAM.gov returned HTTP 404 (documented no-data response): ${diagnostic}`
            : 'SAM.gov returned HTTP 404 (documented no-data response; response body was empty).',
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
          sourceDiagnostic: diagnostic || 'No response detail supplied.',
          note: 'SAM.gov returned its documented HTTP 404 no-data response for this search. Review the sanitized diagnostic if the result is unexpected.',
        });
      }

      if (!response.ok) {
        const detail = diagnostic ? ` Detail: ${diagnostic}` : '';
        await finishAgentTask(prisma, taskId, 'FAILED', {
          message: `SAM.gov returned HTTP ${response.status}.${detail}`,
          recordsFetched: 0,
          recordsSaved: 0,
          recordsFailed: 1,
        });
        return res.status(502).json({
          error: looksLikeCredentialFailure
            ? 'SAM.gov rejected the API credentials or authorization.'
            : 'SAM.gov returned an error.',
          sourceStatus: response.status,
          sourceDiagnostic: diagnostic || 'No response detail supplied.',
        });
      }

      const result = JSON.parse(responseBody) as {
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
            placeOfPerformance: row.placeOfPerformance ?? null,
            sourceUrl,
            retrievedAt: retrievedAt.toISOString(),
          }));
          await upsertResearchRecordPreservingAnalysis(prisma, {
            source: 'sam.gov_opportunities',
            sourceRecordId: noticeId,
            supplierName: asText(awardee.name),
            awardAmount: normalizedAwardAmount,
            sourceUrl,
            payload,
            retrievedAt,
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


  // Daily Grants.gov opportunity refresh. Search2 is a public endpoint and
  // does not require an API key. Only public opportunity metadata is stored;
  // grant contacts are intentionally excluded from sales-lead generation.
  router.get('/research/grants-opportunities', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'Scheduled research is not configured: CRON_SECRET is missing.' });
    if (!authorized(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized scheduled research request.' });

    const taskId = await startAgentTask(prisma, 'Grants.gov collector', 'Collect public federal grant opportunities');
    const retrievedAt = new Date();
    const allRows: Array<Record<string, unknown>> = [];
    let hitCount = 0;

    try {
      for (const startRecordNum of [0, 100]) {
        const response = await fetch('https://api.grants.gov/v1/api/search2', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            rows: 100,
            startRecordNum,
            keyword: '',
            oppStatuses: 'forecasted|posted',
          }),
        });
        if (!response.ok) {
          await finishAgentTask(prisma, taskId, 'FAILED', { message: `Grants.gov returned HTTP ${response.status}.`, recordsFailed: 1 });
          return res.status(502).json({ error: 'Grants.gov returned an error.', sourceStatus: response.status });
        }
        const body = await response.json() as {
          errorcode?: number | string;
          msg?: string;
          data?: { hitCount?: number; oppHits?: Array<Record<string, unknown>> };
        };
        if (Number(body.errorcode) !== 0 || !body.data || !Array.isArray(body.data.oppHits)) {
          await finishAgentTask(prisma, taskId, 'FAILED', { message: 'Grants.gov search response did not contain a successful opportunity result.' });
          return res.status(502).json({ error: 'Grants.gov returned an invalid or unsuccessful search response.' });
        }
        hitCount = Number(body.data.hitCount ?? 0);
        allRows.push(...body.data.oppHits);
        if (startRecordNum === 0 && (hitCount <= 100 || body.data.oppHits.length < 100)) break;
      }

      let saved = 0;
      let skipped = 0;
      for (const row of allRows) {
        const id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id).trim() : '';
        if (!id) { skipped += 1; continue; }
        const asText = (value: unknown): string | null =>
          typeof value === 'string' && value.trim() ? value.trim() : null;
        const title = asText(row.title);
        const opportunityNumber = asText(row.number);
        const sourceUrl = `https://www.grants.gov/search-results-detail/${encodeURIComponent(id)}`;
        const payload = JSON.parse(JSON.stringify({
          recordType: 'federal_grant_opportunity',
          opportunityId: id,
          opportunityNumber,
          title,
          agencyCode: asText(row.agencyCode),
          agencyName: asText(row.agencyName ?? row.agency),
          openDate: asText(row.openDate),
          closeDate: asText(row.closeDate),
          status: asText(row.oppStatus),
          documentType: asText(row.docType),
          assistanceListingNumbers: Array.isArray(row.alnist) ? row.alnist.filter((value): value is string => typeof value === 'string') : [],
          sourceUrl,
          retrievedAt: retrievedAt.toISOString(),
        }));
        await upsertResearchRecordPreservingAnalysis(prisma, {
          source: 'grants.gov_opportunities',
          sourceRecordId: id,
          supplierName: null,
          awardAmount: null,
          sourceUrl,
          payload,
          retrievedAt,
        });
        saved += 1;
      }

      await finishAgentTask(prisma, taskId, 'COMPLETED', {
        message: `Grants.gov collection completed: ${saved} opportunity records saved, ${skipped} skipped.`,
        recordsFetched: allRows.length, recordsSaved: saved, recordsFailed: skipped,
      });
      return res.json({
        ok: true,
        source: 'Grants.gov Search2 API',
        retrievedAt: retrievedAt.toISOString(),
        totalMatchingOpportunities: hitCount,
        fetched: allRows.length,
        saved,
        skipped,
        note: 'Public forecasted and posted grant opportunity metadata. Search results do not establish eligibility, award probability, grant approval, or marketplace revenue. Buyers should verify each notice and its application requirements on Grants.gov.',
      });
    } catch (error) {
      await finishAgentTask(prisma, taskId, 'FAILED', { message: 'Grants.gov collection failed before completion.' });
      console.error('Scheduled Grants.gov refresh failed', error);
      return res.status(502).json({ error: 'Scheduled Grants.gov opportunity refresh failed.' });
    }
  });


  // Daily, safely reconcile agent runs that have been stuck for over two hours.
  // This never reruns a scraper or touches marketplace/customer/payment data.
  router.get('/maintenance/reconcile', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'Scheduled maintenance is not configured: CRON_SECRET is missing.' });
    if (!authorized(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized maintenance request.' });
    if (!allowMaintenanceRequest(req.ip)) return res.status(429).json({ error: 'Maintenance request rate limit exceeded. Try again later.' });
    try {
      const result = await reconcileStaleAgentTasks(prisma);
      return res.json({ ok: true, team: 'Marketplace Maintenance Team', ...result });
    } catch (error) {
      console.error('Scheduled maintenance reconciliation failed', error);
      return res.status(500).json({ error: 'Scheduled maintenance reconciliation failed safely.' });
    }
  });

  return router;
}

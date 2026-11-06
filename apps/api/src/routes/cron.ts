import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const SOURCE_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

function authorized(requestHeader: string | undefined, secret: string): boolean {
  if (!requestHeader?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(requestHeader.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
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
            'Awarding Agency', 'Description', 'Place of Performance State Code', 'NAICS', 'Recipient UEI',
          ],
          page: 1,
          limit: 100,
          sort: 'Award Amount',
          order: 'desc',
        }),
      });

      if (!response.ok) {
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
        const record = {
          awardId,
          supplierName: supplierName ?? null,
          awardAmount: rawAmount ?? null,
          startDate: row['Start Date'] ?? row.start_date ?? null,
          endDate: row['End Date'] ?? row.end_date ?? null,
          awardingAgency: row['Awarding Agency'] ?? row.awarding_agency_name ?? null,
          description: row.Description ?? row.description ?? null,
          performanceState: row['Place of Performance State Code'] ?? row.place_of_performance_state_code ?? null,
          naics: row.NAICS ?? row.naics ?? null,
          supplierUei: row['Recipient UEI'] ?? row.recipient_uei ?? null,
          sourceUrl: 'https://www.usaspending.gov/',
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
            payload: record,
            retrievedAt,
          },
          update: {
            supplierName: typeof supplierName === 'string' ? supplierName : null,
            awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
            sourceUrl: record.sourceUrl,
            payload: record,
            retrievedAt,
          },
        });
        saved += 1;
      }

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
      console.error('Scheduled USAspending refresh failed', error);
      return res.status(502).json({ error: 'Scheduled supplier research refresh failed.' });
    }
  });

  return router;
}

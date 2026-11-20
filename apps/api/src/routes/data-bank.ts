import express from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { z } from 'zod';
import { isCommercialReuseApproved } from '../services/source-rights';

type AuthReq = express.Request & { user?: User };
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function isNwsForecastRecord(record: { sourceUrl: string; payload: unknown }): boolean {
  try {
    const url = new URL(record.sourceUrl);
    const payload = asObject(record.payload);
    return url.protocol === 'https:' &&
      url.hostname === 'api.weather.gov' &&
      /^\/gridpoints\/[A-Z0-9]+\/\d+,\d+\/forecast$/i.test(url.pathname) &&
      payload.sourceTermsUrl === 'https://www.weather.gov/documentation/services-web-api' &&
      hasValue(payload.location) &&
      hasValue(payload.title) &&
      hasValue(payload.startTime) &&
      hasValue(payload.endTime) &&
      hasValue(payload.forecastUpdatedAt);
  } catch {
    return false;
  }
}

export function createDataBankRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.get('/summary', async (_req, res) => {
    try {
      const [totalRecords, sourceGroups, missingSupplierNames, latest] = await Promise.all([
        prisma.supplierResearchRecord.count(),
        prisma.supplierResearchRecord.groupBy({
          by: ['source'],
          _count: { _all: true },
          _max: { retrievedAt: true },
          orderBy: { source: 'asc' },
        }),
        prisma.supplierResearchRecord.count({ where: { supplierName: null } }),
        prisma.supplierResearchRecord.findFirst({
          orderBy: { retrievedAt: 'desc' },
          select: { retrievedAt: true },
        }),
      ]);

      return res.json({
        source: 'database',
        totalRecords,
        sourceCount: sourceGroups.length,
        recordsMissingSupplierName: missingSupplierNames,
        latestRetrievedAt: latest?.retrievedAt ?? null,
        sources: sourceGroups.map((group) => ({
          source: group.source,
          count: group._count._all,
          latestRetrievedAt: group._max.retrievedAt,
        })),
        note: 'Counts describe stored public research records, not verified suppliers, qualified sales leads, or revenue.',
      });
    } catch (error) {
      console.error('Data Bank summary failed', error);
      return res.status(500).json({ error: 'Unable to load Data Bank summary.' });
    }
  });

  router.get('/records', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim().slice(0, 100) : '';
    const requestedPage = Number(req.query.page ?? 1);
    const requestedLimit = Number(req.query.limit ?? 25);
    const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(10000, requestedPage)) : 1;
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 25;
    const where = {
      ...(source ? { source } : {}),
      ...(q ? {
        OR: [
          { supplierName: { contains: q, mode: 'insensitive' as const } },
          { sourceRecordId: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    try {
      const [total, records] = await Promise.all([
        prisma.supplierResearchRecord.count({ where }),
        prisma.supplierResearchRecord.findMany({
          where,
          orderBy: [{ retrievedAt: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            source: true,
            sourceRecordId: true,
            supplierName: true,
            awardAmount: true,
            sourceUrl: true,
            payload: true,
            retrievedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      const data = records.map((record) => {
        const payload = asObject(record.payload);
        const usefulFields = [
          record.supplierName,
          payload.title,
          payload.description,
          payload.awardingAgency,
          payload.awardId,
          payload.noticeId,
          payload.naics,
          payload.supplierUei,
          payload.startDate,
          payload.endDate,
          payload.postedDate,
          payload.responseDeadline,
          payload.startTime,
          payload.endTime,
          payload.temperature,
          payload.windSpeed,
          payload.probabilityOfPrecipitation,
          payload.shortForecast,
        ].filter(hasValue).length;
        return {
          ...record,
          awardAmount: record.awardAmount?.toString() ?? null,
          quality: {
            populatedFieldCount: usefulFields,
            hasSupplierName: Boolean(record.supplierName?.trim()),
            hasSourceLink: Boolean(record.sourceUrl),
            classification: record.source === 'nws_api_forecasts'
              ? 'NWS public-domain forecast periods'
              : record.source === 'sam.gov_opportunities'
                ? 'Government contract opportunity research'
                : record.source === 'grants.gov_opportunities'
                  ? 'Federal grant opportunity research'
                  : 'Public supplier / award research',
          },
        };
      });

      return res.json({
        page,
        limit,
        total,
        pageCount: Math.ceil(total / limit),
        records: data,
      });
    } catch (error) {
      console.error('Data Bank records query failed', error);
      return res.status(500).json({ error: 'Unable to search Data Bank records.' });
    }
  });



  // Manually collect NWS-issued forecast periods. This excludes station observations and third-party feeds.
  // The resulting dataset is always a private, restricted, $0 draft; publication requires seller review.
  router.post('/nws-forecasts', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    // Collection only creates a private, unpriced draft. Publishing remains seller/admin-only.
    if (!isCommercialReuseApproved('nws_api_forecasts')) {
      return res.status(409).json({ error: 'NWS forecast source is not approved in the source-rights register.' });
    }

    const schema = z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      locationLabel: z.string().trim().min(2).max(100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a location label and valid latitude/longitude.' });

    try {
      const headers = {
        accept: 'application/geo+json',
        'user-agent': 'AI-Data-Marketplace/1.0 (+https://aidatamarketplacefinal.vercel.app)',
      };
      const pointUrl = `https://api.weather.gov/points/${parsed.data.latitude},${parsed.data.longitude}`;
      const pointResponse = await fetch(pointUrl, { headers, signal: AbortSignal.timeout(12000) });
      if (!pointResponse.ok) return res.status(502).json({ error: `NWS point lookup failed (HTTP ${pointResponse.status}). Try again later.` });
      const pointPayload = await pointResponse.json() as { properties?: { forecast?: string; gridId?: string; gridX?: number; gridY?: number } };
      const forecastUrl = pointPayload.properties?.forecast;
      if (!forecastUrl) return res.status(502).json({ error: 'NWS did not provide a point forecast URL for this location.' });
      const validatedForecastUrl = new URL(forecastUrl);
      if (validatedForecastUrl.protocol !== 'https:' || validatedForecastUrl.hostname !== 'api.weather.gov' || !validatedForecastUrl.pathname.includes('/gridpoints/')) {
        return res.status(502).json({ error: 'NWS returned an unexpected forecast URL. No data was saved.' });
      }

      const forecastResponse = await fetch(validatedForecastUrl.toString(), { headers, signal: AbortSignal.timeout(12000) });
      if (!forecastResponse.ok) return res.status(502).json({ error: `NWS forecast request failed (HTTP ${forecastResponse.status}).` });
      const forecastPayload = await forecastResponse.json() as { properties?: { updateTime?: string; periods?: Array<Record<string, unknown>> } };
      const periods = Array.isArray(forecastPayload.properties?.periods) ? forecastPayload.properties.periods.slice(0, 14) : [];
      if (!periods.length) return res.status(502).json({ error: 'NWS returned no forecast periods. No data was saved.' });

      const retrievedAt = new Date();
      const records = await Promise.all(periods.map(async (period) => {
        const startTime = String(period.startTime ?? '');
        if (!startTime || Number.isNaN(Date.parse(startTime))) return null;
        const sourceRecordId = `${parsed.data.latitude},${parsed.data.longitude}:${startTime}`;
        const precipitation = period.probabilityOfPrecipitation && typeof period.probabilityOfPrecipitation === 'object'
          ? (period.probabilityOfPrecipitation as Record<string, unknown>).value ?? null : null;
        const payload = {
          title: String(period.name ?? 'Forecast period').slice(0, 160),
          description: String(period.shortForecast ?? 'NWS point forecast').slice(0, 500),
          detailedForecast: String(period.detailedForecast ?? '').slice(0, 3000),
          location: parsed.data.locationLabel,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          startTime,
          endTime: String(period.endTime ?? ''),
          isDaytime: Boolean(period.isDaytime),
          temperature: period.temperature ?? null,
          temperatureUnit: String(period.temperatureUnit ?? ''),
          windSpeed: String(period.windSpeed ?? ''),
          windDirection: String(period.windDirection ?? ''),
          probabilityOfPrecipitation: precipitation,
          forecastUpdatedAt: forecastPayload.properties?.updateTime ?? null,
          gridId: pointPayload.properties?.gridId ?? null,
          gridX: pointPayload.properties?.gridX ?? null,
          gridY: pointPayload.properties?.gridY ?? null,
          attribution: 'National Weather Service (NWS), api.weather.gov. Public-domain government data; no NOAA/NWS endorsement.',
          sourceTermsUrl: 'https://www.weather.gov/disclaimer',
          retrievedAt: retrievedAt.toISOString(),
        };
        return prisma.supplierResearchRecord.upsert({
          where: { source_sourceRecordId: { source: 'nws_api_forecasts', sourceRecordId } },
          create: { source: 'nws_api_forecasts', sourceRecordId, supplierName: null, sourceUrl: validatedForecastUrl.toString(), payload: payload as Prisma.InputJsonValue, retrievedAt },
          update: { sourceUrl: validatedForecastUrl.toString(), payload: payload as Prisma.InputJsonValue, retrievedAt },
          select: { id: true },
        });
      }));
      const savedRecords = records.filter((record): record is NonNullable<typeof record> => Boolean(record));
      if (!savedRecords.length) return res.status(502).json({ error: 'NWS forecast periods did not contain valid start times. No dataset draft was created.' });

      const title = `${parsed.data.locationLabel} - 7-Day Weather Planning Snapshot`.slice(0, 120);
      const validPeriods = periods.filter((period) => {
        const startTime = String(period.startTime ?? '');
        return Boolean(startTime) && !Number.isNaN(Date.parse(startTime));
      });
      const qualityScore = validPeriods.length
        ? Math.round(validPeriods.reduce((sum, period) => sum + [
            period.startTime, period.endTime, period.temperature, period.windSpeed, period.shortForecast,
          ].filter(hasValue).length / 5, 0) / validPeriods.length * 100)
        : 0;
      const sourceRecordTags = savedRecords.map((record) => `source-record-id:${record.id}`);
      const tags = ['factory:v1', 'license:review-required', 'source:nws_api_forecasts', ...sourceRecordTags];
      const description = `A timestamped snapshot of up to 14 NWS-issued day/night forecast periods for ${parsed.data.locationLabel}. Includes forecast window, temperature, wind, precipitation probability, and source provenance. Forecasts change; this is operational planning data, not an official NWS product or guarantee. Source: api.weather.gov. NWS does not endorse this marketplace.`;
      const existing = await prisma.dataset.findFirst({
        where: { sellerId: user.id, title, tags: { has: 'source:nws_api_forecasts' }, status: 'DRAFT' },
        select: { id: true },
      });
      const dataset = existing
        ? await prisma.dataset.update({ where: { id: existing.id }, data: { description, tags, qualityScore, sourceCount: 1, priceCents: 0, licenseType: 'RESTRICTED' } })
        : await prisma.dataset.create({ data: {
            sellerId: user.id, title, category: 'Weather & Operations', description,
            priceCents: 0, qualityScore, licenseType: 'RESTRICTED', sourceCount: 1,
            status: 'DRAFT', tags,
          } });

      return res.status(201).json({
        ok: true,
        recordsSaved: savedRecords.length,
        dataset: { id: dataset.id, title: dataset.title, status: 'draft', priceCents: 0, licenseType: 'restricted' },
        source: 'nws_api_forecasts',
        sourceUrl: validatedForecastUrl.toString(),
        forecastUpdatedAt: forecastPayload.properties?.updateTime ?? null,
        attribution: 'National Weather Service (NWS), api.weather.gov. NWS data is public domain unless specifically noted otherwise. No NOAA/NWS endorsement.',
        note: 'Saved as a private draft only. No listing, price, auction, checkout, or payment was created.',
      });
    } catch (error) {
      console.error('NWS forecast collection failed', error);
      return res.status(502).json({ error: 'Unable to collect NWS forecasts right now. No listing or payment was created.' });
    }
  });

  // Build a value-added planning brief from the signed-in owner's latest NWS forecast draft.
  // This is derived decision-support content, not an official NWS product or a safety guarantee.
  router.get('/weather-brief', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const dataset = await prisma.dataset.findFirst({
        where: { sellerId: user.id, status: 'DRAFT', tags: { has: 'source:nws_api_forecasts' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, tags: true, createdAt: true },
      });
      if (!dataset) return res.status(404).json({ error: 'No private NWS forecast draft exists yet.' });
      const recordIds = dataset.tags.filter((tag) => tag.startsWith('source-record-id:'))
        .map((tag) => tag.slice('source-record-id:'.length)).filter(Boolean);
      if (!recordIds.length) return res.status(404).json({ error: 'The forecast draft has no linked source records.' });
      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: recordIds }, source: 'nws_api_forecasts' },
        orderBy: { retrievedAt: 'desc' },
        select: { id: true, sourceRecordId: true, sourceUrl: true, payload: true, retrievedAt: true },
      });
      if (!records.length) return res.status(404).json({ error: 'No linked NWS forecast records are available.' });
      const periods = records.map((record) => {
        const payload = asObject(record.payload);
        const windText = String(payload.windSpeed ?? '');
        const windMatch = windText.match(/[0-9]+(?:\.[0-9]+)?/);
        return {
          id: record.id,
          period: String(payload.title ?? 'Forecast period'),
          startTime: String(payload.startTime ?? ''),
          endTime: String(payload.endTime ?? ''),
          temperature: typeof payload.temperature === 'number' ? payload.temperature : null,
          temperatureUnit: String(payload.temperatureUnit ?? 'F'),
          shortForecast: String(payload.description ?? ''),
          windSpeed: windText,
          windMph: windMatch ? Number(windMatch[0]) : null,
          windDirection: String(payload.windDirection ?? ''),
          precipitationChance: typeof payload.probabilityOfPrecipitation === 'number' ? payload.probabilityOfPrecipitation : null,
          detailedForecast: String(payload.detailedForecast ?? ''),
          retrievedAt: record.retrievedAt,
          sourceUrl: record.sourceUrl,
          forecastUpdatedAt: String(payload.forecastUpdatedAt ?? ''),
        };
      }).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const temperatures = periods.map((period) => period.temperature).filter((value): value is number => value !== null);
      const precipitation = periods.map((period) => period.precipitationChance).filter((value): value is number => value !== null);
      const winds = periods.map((period) => period.windMph).filter((value): value is number => value !== null);
      const maxPrecipitation = precipitation.length ? Math.max(...precipitation) : null;
      const maxWindMph = winds.length ? Math.max(...winds) : null;
      const planningFlags = [
        ...(maxPrecipitation !== null && maxPrecipitation >= 40 ? ['At least one forecast period has a 40% or higher precipitation probability; consider checking the timing before planning weather-sensitive outdoor work.'] : []),
        ...(maxWindMph !== null && maxWindMph >= 20 ? ['At least one forecast period lists wind of 20 mph or more; review the detailed forecast and current conditions before outdoor operations.'] : []),
      ];
      return res.json({ brief: {
        datasetId: dataset.id,
        datasetTitle: dataset.title,
        location: String(asObject(records[0].payload).location ?? 'Saved forecast location'),
        generatedAt: new Date().toISOString(),
        forecastUpdatedAt: periods.map((period) => period.forecastUpdatedAt).filter(Boolean).sort().at(-1) ?? null,
        retrievedAt: records.reduce((latest, record) => record.retrievedAt > latest ? record.retrievedAt : latest, records[0].retrievedAt),
        periodCount: periods.length,
        summary: {
          minTemperature: temperatures.length ? Math.min(...temperatures) : null,
          maxTemperature: temperatures.length ? Math.max(...temperatures) : null,
          maxPrecipitationChance: maxPrecipitation,
          maxWindMph,
        },
        planningFlags,
        periods,
        source: 'National Weather Service API (api.weather.gov)',
        sourceTermsUrl: 'https://www.weather.gov/disclaimer',
        sourceUrl: periods[0]?.sourceUrl ?? null,
        disclaimer: 'This is a third-party planning summary derived from NWS public-domain forecast data. It is not an official NWS product, does not imply NOAA/NWS endorsement, and is not a guarantee or safety determination. Forecasts may change; check current official alerts and conditions before making operational decisions.',
      } });
    } catch (error) {
      console.error('NWS weather brief generation failed', error);
      return res.status(500).json({ error: 'Unable to generate the weather planning brief.' });
    }
  });

  router.get('/products', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const products = await prisma.dataset.findMany({
        where: { sellerId: user.id, tags: { has: 'factory:v1' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true, title: true, category: true, qualityScore: true,
          sourceCount: true, status: true, licenseType: true, priceCents: true, createdAt: true,
          tags: true,
        },
      });
      const readTag = (tags: string[], prefix: string) => tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? '';
      return res.json({
        products: products.map((product) => ({
          id: product.id, title: product.title, category: product.category,
          qualityScore: product.qualityScore, sourceCount: product.sourceCount, priceCents: product.priceCents, licenseType: product.licenseType.toLowerCase(),
          recordCount: product.tags.filter((tag) => tag.startsWith('source-record-id:')).length,
          status: product.status.toLowerCase(),
          licenseStatus: readTag(product.tags, 'license-review-status:') || 'pending',
          licenseReviewNote: (() => { try { return decodeURIComponent(readTag(product.tags, 'license-review-note:')); } catch { return ''; } })(),
          licenseEvidenceUrl: (() => { try { return decodeURIComponent(readTag(product.tags, 'license-review-evidence:')); } catch { return ''; } })(),
          licenseReviewedAt: readTag(product.tags, 'license-review-at:') || null,
          createdAt: product.createdAt,
        })),
      });
    } catch (error) {
      console.error('Product Factory list failed', error);
      return res.status(500).json({ error: 'Unable to load product drafts.' });
    }
  });

  // Create a private, unpriced/unpublished product draft from selected saved research.
  // Source IDs remain attached to the Dataset tags so provenance can be resolved later.
  router.post('/products', async (req: AuthReq, res) => {
    const schema = z.object({
      recordIds: z.array(z.string().min(1).max(100)).min(1).max(50),
      title: z.string().trim().min(5).max(120),
      category: z.string().trim().min(2).max(80),
      description: z.string().trim().min(20).max(2000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a title, category, description, and 1–50 saved research records.' });
    const user = req.user;
    if (!user || !['seller', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'A seller or admin account is required to create product drafts.' });
    }

    try {
      const uniqueIds = [...new Set(parsed.data.recordIds)];
      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: uniqueIds } },
        orderBy: { retrievedAt: 'desc' },
      });
      if (records.length !== uniqueIds.length) {
        return res.status(400).json({ error: 'One or more selected research records no longer exist. Refresh the Data Bank and try again.' });
      }

      const populatedFields = records.map((record) => {
        const payload = asObject(record.payload);
        return [
          record.supplierName, record.sourceRecordId, record.sourceUrl,
          payload.title, payload.description, payload.awardAmount, payload.awardingAgency,
          payload.naics, payload.supplierUei, payload.startDate, payload.endDate,
          payload.startTime, payload.endTime, payload.temperature, payload.windSpeed,
          payload.probabilityOfPrecipitation,
        ].filter(hasValue).length;
      });
      const fieldCompleteness = populatedFields.reduce((sum, count) => sum + Math.min(count / 11, 1), 0) / records.length;
      const sourceLinkRate = records.filter((record) => Boolean(record.sourceUrl)).length / records.length;
      const supplierNameRate = records.filter((record) => Boolean(record.supplierName?.trim())).length / records.length;
      const qualityScore = Math.round((fieldCompleteness * 60) + (sourceLinkRate * 20) + (supplierNameRate * 20));
      const sourceNames = [...new Set(records.map((record) => record.source))];
      const provenanceTags = [
        'factory:v1',
        'license:review-required',
        ...sourceNames.map((source) => `source:${source.slice(0, 80)}`),
        ...records.map((record) => `source-record-id:${record.id}`),
      ];

      const dataset = await prisma.dataset.create({
        data: {
          sellerId: user.id,
          title: parsed.data.title,
          category: parsed.data.category,
          description: parsed.data.description,
          priceCents: 0,
          qualityScore,
          licenseType: 'RESTRICTED',
          sourceCount: sourceNames.length,
          status: 'DRAFT',
          tags: provenanceTags,
        },
      });

      return res.status(201).json({
        product: {
          id: dataset.id,
          title: dataset.title,
          category: dataset.category,
          status: 'draft',
          priceCents: 0,
          qualityScore,
          quality: {
            recordCount: records.length,
            distinctSourceCount: sourceNames.length,
            sourceLinkRate: Math.round(sourceLinkRate * 100),
            supplierNameRate: Math.round(supplierNameRate * 100),
            fieldCompleteness: Math.round(fieldCompleteness * 100),
          },
          licensing: {
            status: 'review_required',
            note: 'This draft is restricted and unpublished until source terms, redistribution rights, and applicable privacy requirements are reviewed.',
          },
          provenance: records.map((record) => ({
            recordId: record.id,
            source: record.source,
            sourceRecordId: record.sourceRecordId,
            sourceUrl: record.sourceUrl,
            retrievedAt: record.retrievedAt,
          })),
        },
      });
    } catch (error) {
      console.error('Product Factory draft creation failed', error);
      return res.status(500).json({ error: 'Unable to create product draft.' });
    }
  });

  // Seller-entered source review notes are metadata only; this never grants legal clearance
  // or changes the Dataset's DRAFT / RESTRICTED state.
  router.post('/products/:id/licensing-review', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (!['seller', 'admin'].includes(user.role)) return res.status(403).json({ error: 'A seller or admin account is required.' });
    const schema = z.object({
      status: z.enum(['pending', 'seller_reviewed', 'blocked']),
      note: z.string().trim().min(10).max(1000),
      evidenceUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a review note of at least 10 characters and a valid evidence URL when provided.' });
    if (parsed.data.status === 'seller_reviewed' && !parsed.data.evidenceUrl) {
      return res.status(400).json({ error: 'Add a source terms or licensing evidence URL before marking this review as seller-reviewed.' });
    }
    try {
      const productId = String(req.params.id);
      const product = await prisma.dataset.findFirst({
        where: { id: productId, sellerId: user.id, tags: { has: 'factory:v1' } },
        select: { id: true, tags: true },
      });
      if (!product) return res.status(404).json({ error: 'Product draft not found.' });
      const prefixes = ['license-review-status:', 'license-review-note:', 'license-review-evidence:', 'license-review-at:', 'license-reviewer:'];
      const retainedTags = product.tags.filter((tag) => !prefixes.some((prefix) => tag.startsWith(prefix)));
      const reviewedAt = new Date().toISOString();
      const tags = [
        ...retainedTags,
        `license-review-status:${parsed.data.status}`,
        `license-review-note:${encodeURIComponent(parsed.data.note)}`,
        ...(parsed.data.evidenceUrl ? [`license-review-evidence:${encodeURIComponent(parsed.data.evidenceUrl)}`] : []),
        `license-review-at:${reviewedAt}`,
        `license-reviewer:${user.id}`,
      ];
      await prisma.dataset.update({ where: { id: product.id }, data: { tags } });
      return res.json({
        review: { status: parsed.data.status, note: parsed.data.note, evidenceUrl: parsed.data.evidenceUrl || null, reviewedAt },
        productState: 'draft',
        licenseType: 'restricted',
        message: 'Review metadata saved. This does not establish legal permission to redistribute or publish the data.',
      });
    } catch (error) {
      console.error('Product licensing review save failed', error);
      return res.status(500).json({ error: 'Unable to save licensing review.' });
    }
  });

  // Publishing requires an explicit seller attestation, saved source review, evidence URL,
  // positive price, and a complete deliverable source-record set. AI never publishes products.
  router.post('/products/:id/publish', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (!['seller', 'admin'].includes(user.role)) return res.status(403).json({ error: 'A seller or admin account is required.' });

    const schema = z.object({
      priceCents: z.number().int().min(100).max(10_000_000),
      licenseType: z.enum(['COMMERCIAL', 'PERSONAL', 'ENTERPRISE']),
      rightsConfirmed: z.literal(true),
      attestationNote: z.string().trim().min(20).max(1000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Enter a price of at least $1, choose a license, and confirm the seller rights attestation.' });
    }

    try {
      const product = await prisma.dataset.findFirst({
        where: { id: String(req.params.id), sellerId: user.id, tags: { has: 'factory:v1' } },
        select: { id: true, title: true, tags: true, status: true },
      });
      if (!product) return res.status(404).json({ error: 'Product draft not found.' });
      if (product.status !== 'DRAFT') return res.status(409).json({ error: 'Only an unpublished draft can be published from this workflow.' });

      const sourceNames = product.tags
        .filter((tag) => tag.startsWith('source:'))
        .map((tag) => tag.slice('source:'.length));
      if (!sourceNames.length || sourceNames.some((source) => !isCommercialReuseApproved(source))) {
        return res.status(409).json({
          error: 'Publishing is blocked until commercial redistribution rights are verified and approved for every source in this product.',
          blockedSources: sourceNames,
        });
      }

      const readTag = (prefix: string) => product.tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? '';
      const evidenceUrl = readTag('license-review-evidence:');
      if (readTag('license-review-status:') !== 'seller_reviewed' || !evidenceUrl || !/^https:\/\//i.test(decodeURIComponent(evidenceUrl))) {
        return res.status(409).json({ error: 'Save a seller-reviewed source review with an HTTPS evidence URL before publishing.' });
      }

      const recordIds = product.tags
        .filter((tag) => tag.startsWith('source-record-id:'))
        .map((tag) => tag.slice('source-record-id:'.length));
      if (!recordIds.length || new Set(recordIds).size !== recordIds.length) {
        return res.status(409).json({ error: 'The draft must contain a non-empty, duplicate-free source record set.' });
      }
      if (sourceNames.length !== 1 || sourceNames[0] !== 'nws_api_forecasts') {
        return res.status(409).json({ error: 'The publish workflow currently supports only reviewed NWS point/grid forecast datasets.' });
      }
      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: recordIds }, source: 'nws_api_forecasts' },
        select: { id: true, sourceUrl: true, payload: true },
      });
      if (records.length !== recordIds.length || records.some((record) => !isNwsForecastRecord(record))) {
        return res.status(409).json({ error: 'Every attached record must be a complete NWS point/grid forecast period from api.weather.gov with the approved source terms.' });
      }

      const publishedAt = new Date();
      const attestationTags = [
        ...product.tags.filter((tag) => !tag.startsWith('seller-rights-attestation-')),
        'seller-rights-attestation-version:v1',
        `seller-rights-attestation-at:${publishedAt.toISOString()}`,
        `seller-rights-attestation-by:${user.id}`,
        `seller-rights-attestation-note:${encodeURIComponent(parsed.data.attestationNote)}`,
      ];
      const slugBase = product.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'dataset';
      const slug = `${slugBase}-${product.id.slice(-8)}`;

      const listing = await prisma.$transaction(async (tx) => {
        const existing = await tx.listing.findFirst({ where: { datasetId: product.id } });
        const savedListing = existing
          ? await tx.listing.update({
              where: { id: existing.id },
              data: { slug, priceCents: parsed.data.priceCents, currency: 'USD', publishedAt, listingStatus: 'PUBLISHED' },
            })
          : await tx.listing.create({
              data: { datasetId: product.id, slug, priceCents: parsed.data.priceCents, currency: 'USD', publishedAt, listingStatus: 'PUBLISHED' },
            });
        await tx.dataset.update({
          where: { id: product.id },
          data: {
            priceCents: parsed.data.priceCents,
            licenseType: parsed.data.licenseType,
            status: 'PUBLISHED',
            tags: attestationTags,
          },
        });
        return savedListing;
      });

      return res.status(200).json({
        published: true,
        productId: product.id,
        status: 'published',
        priceCents: parsed.data.priceCents,
        licenseType: parsed.data.licenseType.toLowerCase(),
        listing: { id: listing.id, slug: listing.slug },
        note: 'The seller attestation and evidence reference were recorded. This is not a legal determination of redistribution rights.',
      });
    } catch (error) {
      console.error('Product Factory publish failed', error);
      return res.status(500).json({ error: 'Unable to publish this product listing.' });
    }
  });

  // Only the owning seller/admin can inspect the source records included in a draft.
  router.get('/products/:id/records', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const productId = String(req.params.id);
      const product = await prisma.dataset.findFirst({
        where: { id: productId, sellerId: user.id, tags: { has: 'factory:v1' } },
        select: { id: true, title: true, tags: true, qualityScore: true, status: true, licenseType: true },
      });
      if (!product) return res.status(404).json({ error: 'Product draft not found.' });
      const recordIds = product.tags
        .filter((tag) => tag.startsWith('source-record-id:'))
        .map((tag) => tag.slice('source-record-id:'.length));
      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: recordIds } },
        orderBy: { retrievedAt: 'desc' },
      });
      return res.json({
        product: { id: product.id, title: product.title, qualityScore: product.qualityScore, status: product.status.toLowerCase(), licenseType: product.licenseType.toLowerCase() },
        records: records.map((record) => ({
          id: record.id, source: record.source, sourceRecordId: record.sourceRecordId,
          supplierName: record.supplierName, sourceUrl: record.sourceUrl,
          payload: record.payload, retrievedAt: record.retrievedAt,
        })),
        note: 'Source records are returned with their original source links and retrieval timestamps. This draft is not published or cleared for redistribution.',
      });
    } catch (error) {
      console.error('Product Factory provenance lookup failed', error);
      return res.status(500).json({ error: 'Unable to load product provenance.' });
    }
  });


  // Deliver a CSV export only to the dataset owner/admin or a buyer with a PAID order.
  // Payload fields are allow-listed so incidental contact details are never exported.
  router.get('/products/:id/download', async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    try {
      const product = await prisma.dataset.findFirst({
        where: {
          id: String(req.params.id),
          status: 'PUBLISHED',
          licenseType: { in: ['COMMERCIAL', 'PERSONAL', 'ENTERPRISE'] },
          tags: { has: 'factory:v1' },
        },
        select: { id: true, title: true, sellerId: true, tags: true },
      });
      if (!product) return res.status(404).json({ error: 'Published dataset not found or not available for download.' });

      const isOwner = product.sellerId === user.id;
      const isAdmin = user.role === 'admin';
      if (!isOwner && !isAdmin) {
        const paidOrder = await prisma.order.findFirst({
          where: { buyerId: user.id, datasetId: product.id, status: 'PAID' },
          select: { id: true },
        });
        if (!paidOrder) return res.status(403).json({ error: 'A completed paid order is required to download this dataset.' });
      }

      const recordIds = product.tags
        .filter((tag) => tag.startsWith('source-record-id:'))
        .map((tag) => tag.slice('source-record-id:'.length))
        .filter(Boolean);
      if (recordIds.length === 0) return res.status(409).json({ error: 'This dataset has no attached source records to deliver.' });

      const sourceNames = product.tags
        .filter((tag) => tag.startsWith('source:'))
        .map((tag) => tag.slice('source:'.length));
      if (sourceNames.length !== 1 || sourceNames[0] !== 'nws_api_forecasts' ||
          sourceNames.some((source) => !isCommercialReuseApproved(source))) {
        return res.status(409).json({ error: 'Automated delivery supports only source-reviewed NWS point/grid forecast datasets.' });
      }

      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: recordIds }, source: 'nws_api_forecasts' },
        orderBy: [{ retrievedAt: 'desc' }, { sourceRecordId: 'asc' }],
        select: {
          source: true, sourceRecordId: true, sourceUrl: true, payload: true, retrievedAt: true,
        },
      });
      if (records.length !== recordIds.length || records.some((record) => !isNwsForecastRecord(record))) {
        return res.status(409).json({ error: 'The complete approved NWS forecast record set is not available for delivery.' });
      }

      const headers = [
        'location', 'latitude', 'longitude', 'forecast_period', 'start_time', 'end_time',
        'is_daytime', 'temperature', 'temperature_unit', 'probability_of_precipitation',
        'wind_speed', 'wind_direction', 'description', 'detailed_forecast', 'attribution',
        'source_terms_url', 'source', 'source_record_id', 'source_url', 'forecast_updated_at',
        'retrieved_at', 'non_endorsement_notice',
      ];
      const csvCell = (value: unknown) => {
        let text = value === null || value === undefined
          ? ''
          : typeof value === 'string' ? value : JSON.stringify(value);
        if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      };
      const rows = records.map((record) => {
        const payload = asObject(record.payload);
        return [
          payload.location, payload.latitude, payload.longitude, payload.title, payload.startTime, payload.endTime,
          payload.isDaytime, payload.temperature, payload.temperatureUnit, payload.probabilityOfPrecipitation,
          payload.windSpeed, payload.windDirection, payload.description, payload.detailedForecast,
          payload.attribution ?? 'Source: U.S. National Weather Service (NWS).',
          payload.sourceTermsUrl ?? 'https://www.weather.gov/documentation/services-web-api',
          record.source, record.sourceRecordId, record.sourceUrl, payload.forecastUpdatedAt,
          record.retrievedAt.toISOString(),
          'Not an official NWS product. NOAA/NWS does not endorse this dataset.',
        ].map(csvCell).join(',');
      });
      const csv = [headers.map(csvCell).join(','), ...rows].join('\r\n');
      const safeName = product.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dataset';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send('\uFEFF' + csv);
    } catch (error) {
      console.error('Dataset download failed', error);
      return res.status(500).json({ error: 'Unable to prepare the dataset download.' });
    }
  });

  return router;
}

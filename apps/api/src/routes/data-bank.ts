import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { z } from 'zod';

type AuthReq = express.Request & { user?: User };
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
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
        ].filter(hasValue).length;
        return {
          ...record,
          awardAmount: record.awardAmount?.toString() ?? null,
          quality: {
            populatedFieldCount: usefulFields,
            hasSupplierName: Boolean(record.supplierName?.trim()),
            hasSourceLink: Boolean(record.sourceUrl),
            classification: record.source === 'sam.gov_opportunities'
              ? 'Government opportunity research'
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
          sourceCount: true, status: true, licenseType: true, createdAt: true,
          tags: true,
        },
      });
      const readTag = (tags: string[], prefix: string) => tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? '';
      return res.json({
        products: products.map((product) => ({
          id: product.id, title: product.title, category: product.category,
          qualityScore: product.qualityScore, sourceCount: product.sourceCount,
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

  return router;
}

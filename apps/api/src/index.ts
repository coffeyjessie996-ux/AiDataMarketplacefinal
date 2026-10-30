import './instrument';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { scrapeSources } from './services/scraper';
import { prisma } from './lib/prisma';
import { User } from './types';
import { createPipelineRouter } from './routes/pipeline';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// The web app calls `/api/*` (rewritten to this service), while routes are defined without the prefix.
app.use((req, _res, next) => {
  if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
    req.url = req.url.slice(4) || '/';
  }
  next();
});

function hasValidDatabaseUrl() {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

// Do not let a missing/invalid DATABASE_URL look like an empty, successful marketplace.
// Keep /health available so deployment diagnostics can report the configuration state.
app.use((req, res, next) => {
  if (req.path === '/health' || hasValidDatabaseUrl()) return next();
  return res.status(503).json({
    error: 'Database not configured: set DATABASE_URL to a valid PostgreSQL connection string to load live marketplace figures.',
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';

function makeUserToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function decodeUserToken(token: string) {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function getAuthenticatedUserId(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return decodeUserToken(authHeader.replace('Bearer ', '').trim());
  }

  return null;
}

const serializeUser = (user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role.toLowerCase(),
  status: user.status.toLowerCase(),
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const serializeDataset = (dataset: {
  id: string;
  sellerId: string;
  title: string;
  category: string;
  description: string;
  priceCents: number;
  qualityScore: number;
  licenseType: string;
  sourceCount: number;
  status: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: dataset.id,
  sellerId: dataset.sellerId,
  title: dataset.title,
  category: dataset.category,
  description: dataset.description,
  priceCents: dataset.priceCents,
  qualityScore: dataset.qualityScore,
  licenseType: dataset.licenseType.toLowerCase(),
  sourceCount: dataset.sourceCount,
  status: dataset.status.toLowerCase(),
  tags: dataset.tags,
  createdAt: dataset.createdAt.toISOString(),
  updatedAt: dataset.updatedAt.toISOString(),
});

const serializeWallet = (wallet: {
  id: string;
  userId: string;
  balanceCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}) => ({
  id: wallet.id,
  userId: wallet.userId,
  balanceCents: wallet.balanceCents,
  currency: wallet.currency,
  status: wallet.status.toLowerCase(),
  createdAt: wallet.createdAt.toISOString(),
});

const serializePayout = (payout: {
  id: string;
  userId: string;
  walletAccountId: string;
  amountCents: number;
  method: string;
  destinationAccount: string;
  status: string;
  requestedAt: Date;
  processedAt?: Date | null;
}) => ({
  id: payout.id,
  userId: payout.userId,
  walletAccountId: payout.walletAccountId,
  amountCents: payout.amountCents,
  method: payout.method.toLowerCase(),
  destinationAccount: payout.destinationAccount,
  status: payout.status.toLowerCase(),
  requestedAt: payout.requestedAt.toISOString(),
  processedAt: payout.processedAt ? payout.processedAt.toISOString() : undefined,
});

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    (req as express.Request & { user?: User }).user = serializeUser(user) as User;
    return next();
  } catch (error) {
    console.error('requireAuth failed', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
}

function requireRole(roles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as express.Request & { user?: User }).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

app.use('/pipeline', createPipelineRouter(prisma, requireAuth));

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['buyer', 'seller']).default('buyer'),
});

const datasetSchema = z.object({
  title: z.string().min(5),
  category: z.string().min(2),
  description: z.string().min(20),
  priceCents: z.number().int().positive(),
  qualityScore: z.number().int().min(0).max(100),
  licenseType: z
    .enum(['commercial', 'personal', 'enterprise', 'restricted'])
    .default('commercial'),
  sourceCount: z.number().int().min(1).default(1),
  tags: z.array(z.string()).default([]),
  status: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
});

const payoutSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['bank_transfer', 'wire', 'stripe']).default('bank_transfer'),
  destinationAccount: z.string().min(4),
});

// Seed data is explicitly marked by its local-only email domain and sample labels.
// Exclude it from public/live metrics so test rows cannot look like real sales.
const nonDemoDatasetFilter = {
  seller: { isNot: { email: { endsWith: '@local.test' } } },
  title: { not: { contains: '(Sample)' } },
};
const nonDemoOrderFilter = {
  buyer: { isNot: { email: { endsWith: '@local.test' } } },
  dataset: {
    is: {
      seller: { isNot: { email: { endsWith: '@local.test' } } },
      title: { not: { contains: '(Sample)' } },
    },
  },
};
const nonDemoPaidOrderFilter = nonDemoOrderFilter;
const nonDemoPayoutFilter = {
  user: { isNot: { email: { endsWith: '@local.test' } } },
};
const nonDemoUserFilter = {
  email: { not: { endsWith: '@local.test' } },
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-data-marketplace-api',
    databaseConfigured: hasValidDatabaseUrl(),
    timestamp: new Date().toISOString(),
  });
});

app.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, email, password, role } = parsed.data;
  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    return res.status(409).json({ error: 'User already exists.' });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role: role.toUpperCase() as any,
        status: 'ACTIVE',
      },
    });

    await prisma.walletAccount.create({
      data: {
        userId: user.id,
        balanceCents: 0,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
      },
      token: makeUserToken(user.id),
    });
  } catch (error) {
    console.error('register failed', error);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
      status: user.status.toLowerCase(),
    },
    token: makeUserToken(user.id),
  });
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const wallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    wallet: wallet ? serializeWallet(wallet) : null,
  });
});

app.get('/users', requireAuth, requireRole(['admin']), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ users: users.map((user) => serializeUser(user)) });
});

app.get('/datasets', async (_req, res) => {
  const datasets = await prisma.dataset.findMany({
    where: { AND: [{ status: 'PUBLISHED' }, nonDemoDatasetFilter] },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ datasets: datasets.map(serializeDataset) });
});

app.get('/datasets/:id', async (req, res) => {
  const dataset = await prisma.dataset.findFirst({
    where: { AND: [{ id: req.params.id, status: 'PUBLISHED' }, nonDemoDatasetFilter] },
  });
  if (!dataset) return res.status(404).json({ error: 'Dataset not found.' });
  return res.json({ dataset: serializeDataset(dataset) });
});

app.post('/datasets', requireAuth, requireRole(['seller', 'admin']), async (req, res) => {
  const parsed = datasetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const dataset = await prisma.dataset.create({
    data: {
      sellerId: user.id,
      title: parsed.data.title,
      category: parsed.data.category,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
      qualityScore: parsed.data.qualityScore,
      licenseType: parsed.data.licenseType.toUpperCase() as any,
      sourceCount: parsed.data.sourceCount,
      status: parsed.data.status.toUpperCase() as any,
      tags: parsed.data.tags,
    },
  });

  return res.status(201).json({ dataset: serializeDataset(dataset) });
});

// Scraper endpoint - accepts array of URLs and returns scraped snippets
app.post('/scrapers/start', requireAuth, async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.urls)
      ? req.body.urls.filter((url: unknown): url is string => typeof url === 'string')
      : [];

    if (urls.length === 0) {
      return res.status(400).json({
        error: 'Provide at least one URL to scrape.',
      });
    }
    if (urls.length > 20) {
      return res.status(400).json({
        error: 'Submit no more than 20 URLs per request.',
      });
    }

    const results = await scrapeSources(urls);

    return res.status(200).json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Scraper failed', error);
    return res.status(500).json({
      error: 'Scraper failed.',
    });
  }
});


// Public-source supplier intelligence: US federal contract awards from USAspending.gov.
// Results retain the official source URL and retrieval timestamp; this endpoint does not
// claim that records are independently verified or that a sale has occurred.
app.get('/research/suppliers/federal-awards', requireAuth, async (req, res) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStartDate = new Date(today);
  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - 90);
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : defaultStartDate.toISOString().slice(0, 10);
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : defaultEnd;
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;

  if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
    return res.status(400).json({ error: 'Use valid YYYY-MM-DD startDate and endDate values, with startDate no later than endDate.' });
  }

  try {
    const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
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
        limit,
        sort: 'Award Amount',
        order: 'desc',
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'USAspending.gov returned an error.', sourceStatus: response.status });
    }

    const payload = await response.json() as { results?: Array<Record<string, unknown>>; page_metadata?: unknown };
    const sourceValue = (row: Record<string, unknown>, label: string, normalized: string) => row[label] ?? row[normalized] ?? null;
    const retrievedAt = new Date().toISOString();
    const records = (Array.isArray(payload.results) ? payload.results : []).map((row) => ({
      awardId: sourceValue(row, 'Award ID', 'award_id'),
      supplierName: sourceValue(row, 'Recipient Name', 'recipient_name'),
      awardAmount: sourceValue(row, 'Award Amount', 'award_amount'),
      startDate: sourceValue(row, 'Start Date', 'start_date'),
      endDate: sourceValue(row, 'End Date', 'end_date'),
      awardingAgency: sourceValue(row, 'Awarding Agency', 'awarding_agency_name'),
      description: sourceValue(row, 'Description', 'description'),
      performanceState: sourceValue(row, 'Place of Performance State Code', 'place_of_performance_state_code'),
      naics: sourceValue(row, 'NAICS', 'naics'),
      supplierUei: sourceValue(row, 'Recipient UEI', 'recipient_uei'),
      sourceUrl: 'https://www.usaspending.gov/',
      retrievedAt,
    }));

    let persistedCount = 0;
    for (const record of records) {
      const sourceRecordId = String(record.awardId ?? '').trim();
      if (!sourceRecordId) continue;

      const amount = Number(record.awardAmount);
      await prisma.supplierResearchRecord.upsert({
        where: {
          source_sourceRecordId: {
            source: 'usaspending.gov',
            sourceRecordId,
          },
        },
        create: {
          source: 'usaspending.gov',
          sourceRecordId,
          supplierName: typeof record.supplierName === 'string' ? record.supplierName : null,
          awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
          sourceUrl: String(record.sourceUrl),
          payload: record as any,
          retrievedAt: new Date(retrievedAt),
        },
        update: {
          supplierName: typeof record.supplierName === 'string' ? record.supplierName : null,
          awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
          sourceUrl: String(record.sourceUrl),
          payload: record as any,
          retrievedAt: new Date(retrievedAt),
        },
      });
      persistedCount += 1;
    }

    return res.json({
      source: 'USAspending.gov',
      sourceUrl: 'https://api.usaspending.gov/api/v2/search/spending_by_award/',
      retrievedAt,
      dateRange: { startDate, endDate },
      count: records.length,
      persistedCount,
      records,
      note: 'Public federal award data for supplier research. Check the source record before making commercial decisions; results are not independently verified and are not saved as a marketplace product by this endpoint.',
    });
  } catch (error) {
    console.error('USAspending supplier research failed', error);
    return res.status(502).json({ error: 'Unable to retrieve supplier records from USAspending.gov right now.' });
  }
});

app.get('/research/suppliers/federal-awards/saved', requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';

  try {
    const records = await prisma.supplierResearchRecord.findMany({
      where: {
        source: 'usaspending.gov',
        ...(search ? { supplierName: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { retrievedAt: 'desc' },
      take: limit,
    });

    return res.json({
      source: 'USAspending.gov',
      count: records.length,
      records: records.map((record) => ({
        id: record.id,
        source: record.source,
        sourceRecordId: record.sourceRecordId,
        supplierName: record.supplierName,
        awardAmount: record.awardAmount?.toString() ?? null,
        sourceUrl: record.sourceUrl,
        payload: record.payload,
        retrievedAt: record.retrievedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Saved supplier research lookup failed', error);
    return res.status(500).json({ error: 'Unable to read saved supplier records.' });
  }
});

app.get('/wallet', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const wallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  return res.json({ wallet: wallet ? serializeWallet(wallet) : null });
});

app.post('/wallet/payout', requireAuth, async (_req, res) => {
  // Payout integrations are currently simulated. Do not debit wallets or imply money will be sent.
  return res.status(503).json({
    error: 'Payouts are not enabled yet. A verified payout provider integration is required.',
  });
});

app.post('/orders', requireAuth, async (_req, res) => {
  // The current wallet flow is not backed by a verified payment processor.
  // Block it rather than recording an order as PAID without a real payment.
  return res.status(503).json({
    error: 'Checkout is not enabled yet. A verified payment integration is required before purchases can be completed.',
  });
});

// Public marketplace figures come from persisted database records only.
app.get('/marketplace/overview', async (_req, res) => {
  try {
    const [
      paidOrderValue,
      paidOrders,
      publishedDatasets,
      totalDatasets,
      supplierResearchRecords,
      latestSupplierRecord,
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] },
      }),
      prisma.order.count({ where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] } }),
      prisma.dataset.count({ where: { AND: [{ status: 'PUBLISHED' }, nonDemoDatasetFilter] } }),
      prisma.dataset.count({ where: nonDemoDatasetFilter }),
      prisma.supplierResearchRecord.count(),
      prisma.supplierResearchRecord.findFirst({
        orderBy: { retrievedAt: 'desc' },
        select: { retrievedAt: true },
      }),
    ]);

    return res.json({
      source: 'database',
      updatedAt: new Date().toISOString(),
      // These are database records, not confirmation of a processed payment.
      paymentProcessingEnabled: false,
      snapshot: {
        recordedPaidOrderValueCents: Number(paidOrderValue._sum.totalCents ?? 0),
        paidOrders,
        publishedDatasets,
        totalDatasets,
        supplierResearchRecords,
        latestSupplierRetrievedAt: latestSupplierRecord?.retrievedAt.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Marketplace overview failed', error);
    return res.status(500).json({ error: 'Unable to load marketplace figures from the database.' });
  }
});

// Authenticated dashboard figures are scoped to the signed-in account, except for admins.
app.get('/dashboard/overview', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const isAdmin = user.role === 'admin';
  const isTestAccount = user.email.toLowerCase().endsWith('@local.test');
  const orderScope: any = isAdmin
    ? {}
    : user.role === 'seller'
      ? { dataset: { sellerId: user.id } }
      : { buyerId: user.id };
  const paidOrderWhere: any = {
    AND: [{ status: 'PAID' }, orderScope, nonDemoPaidOrderFilter],
  };

  const datasetScope: any = isAdmin
    ? {}
    : user.role === 'seller'
      ? { sellerId: user.id }
      : { status: 'PUBLISHED' };
  const datasetWhere: any = { AND: [datasetScope, nonDemoDatasetFilter] };

  const publishedDatasetScope: any = user.role === 'seller'
    ? { sellerId: user.id, status: 'PUBLISHED' }
    : { status: 'PUBLISHED' };
  const publishedDatasetWhere: any = {
    AND: [publishedDatasetScope, nonDemoDatasetFilter],
  };

  const payoutScope: any = isAdmin ? {} : { userId: user.id };
  const payoutWhere: any = {
    AND: [
      payoutScope,
      nonDemoPayoutFilter,
      { status: { in: ['REQUESTED', 'PROCESSING', 'APPROVED'] } },
    ],
  };

  try {
    const [
      wallet,
      totalDatasets,
      publishedDatasets,
      paidOrderValue,
      paidOrders,
      pendingPayouts,
      supplierResearchRecords,
      latestSupplierRecord,
      recentOrders,
      recentSupplierRecords,
      userCount,
    ] = await Promise.all([
      prisma.walletAccount.findUnique({ where: { userId: user.id } }),
      prisma.dataset.count({ where: datasetWhere }),
      prisma.dataset.count({ where: publishedDatasetWhere }),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: paidOrderWhere }),
      prisma.order.count({ where: paidOrderWhere }),
      prisma.payout.count({ where: payoutWhere }),
      prisma.supplierResearchRecord.count(),
      prisma.supplierResearchRecord.findFirst({
        orderBy: { retrievedAt: 'desc' },
        select: { retrievedAt: true },
      }),
      prisma.order.findMany({
        where: paidOrderWhere,
        include: { dataset: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.supplierResearchRecord.findMany({
        orderBy: { retrievedAt: 'desc' },
        select: {
          id: true,
          source: true,
          supplierName: true,
          awardAmount: true,
          sourceUrl: true,
          retrievedAt: true,
        },
        take: 5,
      }),
      isAdmin ? prisma.user.count({ where: nonDemoUserFilter }) : Promise.resolve(null),
    ]);

    return res.json({
      source: 'database',
      updatedAt: new Date().toISOString(),
      role: user.role,
      testAccount: isTestAccount,
      paymentProcessingEnabled: false,
      snapshot: {
        walletBalanceCents: isTestAccount ? 0 : (wallet?.balanceCents ?? 0),
        totalDatasets,
        publishedDatasets,
        recordedPaidOrderValueCents: Number(paidOrderValue._sum.totalCents ?? 0),
        paidOrders,
        pendingPayouts,
        supplierResearchRecords,
        latestSupplierRetrievedAt: latestSupplierRecord?.retrievedAt.toISOString() ?? null,
        userCount,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        datasetTitle: order.dataset.title,
        totalCents: order.totalCents,
        currency: order.currency,
        status: order.status.toLowerCase(),
        createdAt: order.createdAt.toISOString(),
      })),
      recentSupplierRecords: recentSupplierRecords.map((record) => ({
        id: record.id,
        source: record.source,
        supplierName: record.supplierName,
        awardAmount: record.awardAmount?.toString() ?? null,
        sourceUrl: record.sourceUrl,
        retrievedAt: record.retrievedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Dashboard overview failed', error);
    return res.status(500).json({ error: 'Unable to load live dashboard figures from the database.' });
  }
});

// Role-scoped dashboard detail endpoints use stored records; no local demo data is returned.
app.get('/dashboard/datasets', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const scope: any = user.role === 'admin'
    ? {}
    : user.role === 'seller'
      ? { sellerId: user.id }
      : { status: 'PUBLISHED' };
  try {
    const datasets = await prisma.dataset.findMany({
      where: { AND: [scope, nonDemoDatasetFilter] },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ datasets: datasets.map(serializeDataset) });
  } catch (error) {
    console.error('Dashboard datasets failed', error);
    return res.status(500).json({ error: 'Unable to load datasets from the database.' });
  }
});

app.get('/dashboard/orders', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const scope: any = user.role === 'admin'
    ? {}
    : user.role === 'seller'
      ? { dataset: { sellerId: user.id } }
      : { buyerId: user.id };
  try {
    const orders = await prisma.order.findMany({
      where: { AND: [scope, nonDemoOrderFilter] },
      include: { dataset: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({
      orders: orders.map((order) => ({
        id: order.id,
        datasetTitle: order.dataset.title,
        totalCents: order.totalCents,
        currency: order.currency,
        status: order.status.toLowerCase(),
        createdAt: order.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Dashboard orders failed', error);
    return res.status(500).json({ error: 'Unable to load orders from the database.' });
  }
});

app.get('/dashboard/payouts', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const scope: any = user.role === 'admin' ? {} : { userId: user.id };
  try {
    const payouts = await prisma.payout.findMany({
      where: { AND: [scope, nonDemoPayoutFilter] },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return res.json({ payouts: payouts.map(serializePayout) });
  } catch (error) {
    console.error('Dashboard payouts failed', error);
    return res.status(500).json({ error: 'Unable to load payout requests from the database.' });
  }
});

// Admin-only diagnostic: inspect the exact PostgreSQL role used by this API connection.
 // Never returns connection strings, credentials, or role names.
app.get('/admin/database-security-check', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{
      isSuperuser: boolean;
      bypassRls: boolean;
      tableName: string;
      tableExists: boolean;
      rlsEnabled: boolean;
      forceRls: boolean;
      isTableOwner: boolean;
      canSelect: boolean;
      canInsert: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>>`
      SELECT
        role.rolsuper AS "isSuperuser",
        role.rolbypassrls AS "bypassRls",
        requested.table_name AS "tableName",
        (table_info.oid IS NOT NULL) AS "tableExists",
        COALESCE(table_info.relrowsecurity, false) AS "rlsEnabled",
        COALESCE(table_info.relforcerowsecurity, false) AS "forceRls",
        COALESCE(table_info.relowner = role.oid, false) AS "isTableOwner",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'SELECT'), false) AS "canSelect",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'INSERT'), false) AS "canInsert",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'UPDATE'), false) AS "canUpdate",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'DELETE'), false) AS "canDelete"
      FROM pg_roles AS role
      CROSS JOIN (VALUES
        ('User'),
        ('WalletAccount'),
        ('Dataset'),
        ('Listing'),
        ('Order'),
        ('WalletTransaction'),
        ('SupplierResearchRecord'),
        ('Payout')
      ) AS requested(table_name)
      LEFT JOIN pg_class AS table_info
        ON table_info.relname = requested.table_name
       AND table_info.relnamespace = 'public'::regnamespace
       AND table_info.relkind IN ('r', 'p')
      WHERE role.rolname = current_user
      ORDER BY requested.table_name
    `;

    const role = rows[0];
    const tableChecks = rows.map((table) => ({
      table: table.tableName,
      exists: table.tableExists,
      rlsEnabled: table.rlsEnabled,
      forceRls: table.forceRls,
      isTableOwner: table.isTableOwner,
      canSelect: table.canSelect,
      canInsert: table.canInsert,
      canUpdate: table.canUpdate,
      canDelete: table.canDelete,
      canOperateWithRls: table.tableExists && (
        role.isSuperuser ||
        role.bypassRls ||
        (table.isTableOwner && !table.forceRls)
      ),
    }));

    return res.json({
      source: 'current_api_database_connection',
      roleCanBypassRls: Boolean(role?.isSuperuser || role?.bypassRls),
      tables: tableChecks,
      note: 'Run this diagnostic using an administrator account. It does not reveal credentials or modify database state.',
    });
  } catch (error) {
    console.error('Database security diagnostic failed', error);
    return res.status(500).json({ error: 'Unable to inspect the API database connection permissions.' });
  }
});

app.get('/admin/overview', requireAuth, requireRole(['admin']), async (_req, res) => {
  const [
    datasets,
    orders,
    payouts,
    users,
    totalRevenue,
    activeOrders,
    pendingPayouts,
    platformLiquidity,
  ] = await Promise.all([
    prisma.dataset.findMany({ where: nonDemoDatasetFilter, orderBy: { createdAt: 'desc' } }),
    prisma.order.findMany({ where: nonDemoPaidOrderFilter, orderBy: { createdAt: 'desc' } }),
    prisma.payout.findMany({ where: nonDemoPayoutFilter, orderBy: { requestedAt: 'desc' } }),
    prisma.user.findMany({ where: nonDemoUserFilter, orderBy: { createdAt: 'desc' } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] },
    }),
    prisma.order.count({ where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] } }),
    prisma.payout.count({ where: { AND: [{ status: { in: ['REQUESTED', 'PROCESSING', 'APPROVED'] } }, nonDemoPayoutFilter] } }),
    prisma.walletAccount.aggregate({
      _sum: { balanceCents: true },
      where: { user: { isNot: { email: { endsWith: '@local.test' } } } },
    }),
  ]);

  return res.json({
    snapshot: {
      totalRevenueCents: Number(totalRevenue._sum.totalCents ?? 0),
      totalDatasets: datasets.length,
      activeOrders,
      pendingPayouts,
      platformLiquidityCents: Number(platformLiquidity._sum.balanceCents ?? 0),
      updatedAt: new Date().toISOString(),
    },
    datasets: datasets.map(serializeDataset),
    orders: orders.map((order) => ({
      id: order.id,
      buyerId: order.buyerId,
      datasetId: order.datasetId,
      totalCents: order.totalCents,
      currency: order.currency,
      status: order.status.toLowerCase(),
      createdAt: order.createdAt.toISOString(),
    })),
    payouts: payouts.map(serializePayout),
    users: users.map(({ passwordHash: _passwordHash, ...user }) => serializeUser(user as any)),
  });
});

Sentry.setupExpressErrorHandler(app);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error.' });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`AI Data Marketplace API listening on http://localhost:${port}`);
  });
}

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

const wallet = {
  balance: 18450.75,
  pendingPayouts: 3420.1,
  bankAccount: '**** 2847',
};

const pipelineJobs = [
  {
    id: 'job-1001',
    source: 'MarketScan AI',
    dataset: 'B2B SaaS buyer intent leads',
    status: 'completed',
    profit: 2400,
    cleanedAt: '2026-10-05T10:00:00Z',
  },
  {
    id: 'job-1002',
    source: 'news-aggregator',
    dataset: 'AI hiring signal summary',
    status: 'processing',
    profit: 1380,
    cleanedAt: '2026-10-05T11:15:00Z',
  },
  {
    id: 'job-1003',
    source: 'product intelligence',
    dataset: 'competitive feature matrix',
    status: 'completed',
    profit: 3250,
    cleanedAt: '2026-10-05T12:40:00Z',
  },
];

const inventory = [
  {
    id: 'listing-01',
    title: 'Global AI Hiring Signal Index',
    category: 'Talent Intelligence',
    source: 'company career pages + job boards',
    qualityScore: 97,
    price: 299,
    description:
      'Cleaned and normalized hiring trends across 25 countries, updated weekly with firm-level hiring momentum signals.',
    tags: ['hiring', 'talent', 'ai'],
    updatedAt: '2026-10-04T12:00:00Z',
    status: 'published',
  },
  {
    id: 'listing-02',
    title: 'SaaS Pricing Benchmark Dataset',
    category: 'Market Research',
    source: 'website, app stores, review data',
    qualityScore: 94,
    price: 399,
    description:
      'Structured pricing tables, feature bundles, and market positioning for 120+ SaaS product categories.',
    tags: ['pricing', 'saas', 'benchmark'],
    updatedAt: '2026-10-03T15:40:00Z',
    status: 'published',
  },
  {
    id: 'listing-03',
    title: 'AI Vendor Mapping for SMBs',
    category: 'Vendor Intelligence',
    source: 'vendor websites + review scraping',
    qualityScore: 92,
    price: 240,
    description:
      'A cleaned directory of AI vendors serving SMBs, organized by use case, adoption stage, and target segment.',
    tags: ['vendors', 'ai', 'market-map'],
    updatedAt: '2026-10-04T09:30:00Z',
    status: 'published',
  },
];

const metrics = {
  totalRevenue: 128400,
  activeBuyers: 456,
  datasetCount: 284,
  payoutReady: wallet.balance,
};

const listingSchema = z.object({
  title: z.string().min(5),
  category: z.string().min(2),
  description: z.string().min(10),
  source: z.string().min(3),
  price: z.number().positive(),
  qualityScore: z.number().int().min(0).max(100),
  tags: z.array(z.string()).default([]),
  status: z.string().default('published'),
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'ai-data-marketplace-api', timestamp: new Date().toISOString() });
});

app.get('/metrics', (_req, res) => {
  res.json({ metrics, wallet, pipelineJobs: pipelineJobs.length });
});

app.get('/marketplace/items', (_req, res) => {
  res.json({ items: inventory, total: inventory.length });
});

app.post('/marketplace/items', (req, res) => {
  const parsed = listingSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const item = {
    id: randomUUID(),
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };

  inventory.unshift(item);
  res.status(201).json(item);
});

app.post('/marketplace/purchase', (req, res) => {
  const schema = z.object({ listingId: z.string(), buyerId: z.string() });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const listing = inventory.find((item) => item.id === parsed.data.listingId);

  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const revenue = Number(listing.price);
  wallet.balance += revenue;
  metrics.totalRevenue += revenue;

  res.status(200).json({
    ok: true,
    message: `Purchase completed for ${listing.title}`,
    revenue,
    wallet,
  });
});

app.post('/wallet/cashout', (req, res) => {
  const schema = z.object({ amount: z.number().positive(), bankAccount: z.string().min(4) });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { amount, bankAccount } = parsed.data;

  if (amount > wallet.balance) {
    return res.status(400).json({ error: 'Insufficient balance for payout' });
  }

  wallet.balance -= amount;
  wallet.pendingPayouts += amount;
  wallet.bankAccount = bankAccount;

  res.status(200).json({
    ok: true,
    message: 'Payout queued successfully',
    payout: amount,
    wallet,
  });
});

app.get('/pipeline/jobs', (_req, res) => {
  res.json({ jobs: pipelineJobs });
});

app.listen(port, () => {
  console.log(`AI Data Marketplace API listening on http://localhost:${port}`);
});

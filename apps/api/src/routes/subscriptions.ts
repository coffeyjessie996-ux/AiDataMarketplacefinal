import express from 'express';
import Stripe from 'stripe';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { isApprovedNwsForecastRecord, isCommercialReuseApproved } from '../services/source-rights';
import { z } from 'zod';

type AuthReq = express.Request & { user?: User };

const checkoutSchema = z.object({
  datasetId: z.string().min(1).max(128),
  interval: z.enum(['month', 'year']),
});


function periodEnd(subscription: Stripe.Subscription): Date | null {
  const seconds = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

export function createSubscriptionsRouter(
  prisma: PrismaClient,
  auth: express.RequestHandler,
  getStripe: () => Stripe | null,
) {
  const router = express.Router();

  router.get('/', auth, async (req: AuthReq, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const subscriptions = await prisma.marketplaceSubscription.findMany({
        where: { buyerId: req.user.id },
        include: { dataset: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.json({ subscriptions: subscriptions.map((item) => ({
        id: item.id, datasetId: item.datasetId, datasetTitle: item.dataset.title,
        status: item.status.toLowerCase(), interval: item.billingInterval,
        amountCents: item.unitAmountCents, currency: item.currency,
        currentPeriodEnd: item.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: item.cancelAtPeriodEnd,
      })) });
    } catch (error) {
      console.error('Subscription list failed', error);
      return res.status(500).json({ error: 'Unable to load subscriptions.' });
    }
  });

  router.post('/checkout', auth, async (req: AuthReq, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (process.env.STRIPE_CHECKOUT_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Recurring checkout is not enabled.' });
    }
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });

    try {
      const dataset = await prisma.dataset.findFirst({
        where: {
          id: parsed.data.datasetId, status: 'PUBLISHED', licenseType: { not: 'RESTRICTED' },
          tags: { has: 'factory:v1' },
          seller: { isNot: { email: { endsWith: '@local.test' } } },
          title: { not: { contains: '(Sample)' } },
        },
      });
      if (!dataset) return res.status(404).json({ error: 'This dataset is not available for subscription.' });
      if (dataset.sellerId === req.user.id) return res.status(400).json({ error: 'You cannot subscribe to your own dataset.' });
      const amountCents = parsed.data.interval === 'month' ? dataset.monthlyPriceCents : dataset.annualPriceCents;
      if (!amountCents || amountCents < 100) return res.status(409).json({ error: 'The seller has not configured this recurring price.' });

      const recordIds = dataset.tags.filter((tag) => tag.startsWith('source-record-id:')).map((tag) => tag.slice('source-record-id:'.length));
      const sources = dataset.tags.filter((tag) => tag.startsWith('source:')).map((tag) => tag.slice('source:'.length));
      if (!recordIds.length || new Set(recordIds).size !== recordIds.length ||
          !dataset.tags.includes('license-review-status:seller_reviewed') ||
          !dataset.tags.some((tag) => tag.startsWith('license-review-evidence:')) ||
          sources.length !== 1 || sources[0] !== 'nws_api_forecasts' ||
          sources.some((source) => !isCommercialReuseApproved(source))) {
        return res.status(409).json({ error: 'Seller source-rights review and evidence are required before recurring checkout.' });
      }
      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: recordIds }, source: 'nws_api_forecasts' },
        select: { id: true, sourceUrl: true, payload: true },
      });
      if (records.length !== recordIds.length || records.some((item) => !isApprovedNwsForecastRecord(item))) {
        return res.status(409).json({ error: 'The approved forecast records are not complete for delivery.' });
      }

      const existing = await prisma.marketplaceSubscription.findFirst({
        where: { buyerId: req.user.id, datasetId: dataset.id, status: { in: ['ACTIVE', 'TRIALING', 'INCOMPLETE'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing && ['ACTIVE', 'TRIALING'].includes(existing.status)) {
        return res.status(409).json({ error: 'You already have an active subscription to this dataset.' });
      }
      const subscriptionRecord = existing ?? await prisma.marketplaceSubscription.create({
        data: {
          buyerId: req.user.id, datasetId: dataset.id, billingInterval: parsed.data.interval,
          unitAmountCents: amountCents, currency: 'USD', status: 'INCOMPLETE',
        },
      });
      if (existing) {
        await prisma.marketplaceSubscription.update({
          where: { id: existing.id },
          data: { billingInterval: parsed.data.interval, unitAmountCents: amountCents, status: 'INCOMPLETE' },
        });
      }
      const baseUrl = (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd', unit_amount: amountCents,
            recurring: { interval: parsed.data.interval },
            product_data: { name: dataset.title.slice(0, 250), description: dataset.description.slice(0, 500) },
          },
        }],
        customer_email: req.user.email,
        client_reference_id: subscriptionRecord.id,
        metadata: { marketplaceSubscriptionId: subscriptionRecord.id, datasetId: dataset.id, buyerId: req.user.id },
        subscription_data: { metadata: { marketplaceSubscriptionId: subscriptionRecord.id, datasetId: dataset.id, buyerId: req.user.id } },
        success_url: `${baseUrl}/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/?subscription=cancelled`,
      }, { idempotencyKey: `marketplace-subscription-${subscriptionRecord.id}-${parsed.data.interval}` });
      if (!session.url) throw new Error('Stripe did not return a subscription Checkout URL.');
      await prisma.marketplaceSubscription.update({
        where: { id: subscriptionRecord.id },
        data: { stripeCheckoutSessionId: session.id },
      });
      return res.status(201).json({ subscriptionId: subscriptionRecord.id, checkoutUrl: session.url });
    } catch (error) {
      console.error('Recurring Checkout creation failed', error);
      return res.status(502).json({ error: 'Unable to start recurring checkout. No payment was confirmed.' });
    }
  });


  router.get('/checkout-session/:sessionId', auth, async (req: AuthReq, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    const sessionId = String(req.params.sessionId || '');
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) return res.status(400).json({ error: 'Invalid Checkout session reference.' });
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const recordId = session.metadata?.marketplaceSubscriptionId;
      if (session.mode !== 'subscription' || session.metadata?.buyerId !== req.user.id || !recordId ||
          session.client_reference_id !== recordId) {
        return res.status(404).json({ error: 'Subscription Checkout session not found for this account.' });
      }
      const item = await prisma.marketplaceSubscription.findFirst({
        where: { id: recordId, buyerId: req.user.id },
        include: { dataset: { select: { title: true } } },
      });
      if (!item || session.metadata?.datasetId !== item.datasetId) return res.status(404).json({ error: 'Subscription not found.' });
      return res.json({
        subscriptionId: item.id, datasetTitle: item.dataset.title, status: item.status.toLowerCase(),
        interval: item.billingInterval, amountCents: item.unitAmountCents,
        currentPeriodEnd: item.currentPeriodEnd?.toISOString() ?? null,
      });
    } catch (error) {
      console.error('Subscription Checkout lookup failed', error);
      return res.status(502).json({ error: 'Unable to verify subscription status right now.' });
    }
  });

  router.post('/:id/portal', auth, async (req: AuthReq, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    try {
      const item = await prisma.marketplaceSubscription.findFirst({
        where: { id: String(req.params.id), buyerId: req.user.id },
      });
      if (!item || !item.stripeCustomerId) return res.status(404).json({ error: 'Subscription billing account not found.' });
      const baseUrl = (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
      const portal = await stripe.billingPortal.sessions.create({ customer: item.stripeCustomerId, return_url: `${baseUrl}/dashboard` });
      return res.json({ url: portal.url });
    } catch (error) {
      console.error('Billing portal session failed', error);
      return res.status(502).json({ error: 'Unable to open subscription management.' });
    }
  });

  router.get('/:id/download', auth, async (req: AuthReq, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const item = await prisma.marketplaceSubscription.findFirst({
        where: {
          id: String(req.params.id), buyerId: req.user.id,
          status: { in: ['ACTIVE', 'TRIALING'] },
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
        },
        include: { dataset: true },
      });
      if (!item || item.dataset.status !== 'PUBLISHED' || item.dataset.licenseType === 'RESTRICTED' ||
          !item.dataset.tags.includes('factory:v1') ||
          !item.dataset.tags.includes('license-review-status:seller_reviewed') ||
          !item.dataset.tags.some((tag) => tag.startsWith('license-review-evidence:'))) {
        return res.status(404).json({ error: 'An active subscription with delivery access was not found.' });
      }
      const ids = item.dataset.tags.filter((tag) => tag.startsWith('source-record-id:')).map((tag) => tag.slice('source-record-id:'.length));
      const sources = item.dataset.tags.filter((tag) => tag.startsWith('source:')).map((tag) => tag.slice('source:'.length));
      if (!ids.length || new Set(ids).size !== ids.length || sources.length !== 1 || sources[0] !== 'nws_api_forecasts' ||
          sources.some((source) => !isCommercialReuseApproved(source))) {
        return res.status(409).json({ error: 'This subscription does not have an approved delivery format.' });
      }
      const records = await prisma.supplierResearchRecord.findMany({
        where: { id: { in: ids }, source: 'nws_api_forecasts' },
        orderBy: [{ retrievedAt: 'desc' }, { sourceRecordId: 'asc' }],
      });
      if (records.length !== ids.length || records.some((record) => !isApprovedNwsForecastRecord(record))) {
        return res.status(409).json({ error: 'Approved forecast records are not available for delivery.' });
      }
      const columns = ['location', 'title', 'startTime', 'endTime', 'forecastUpdatedAt', 'temperature', 'temperatureUnit', 'shortForecast', 'windSpeed', 'windDirection', 'precipitationChance'];
      const cell = (value: unknown) => {
        let text = value === null || value === undefined ? '' : String(value);
        if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const lines = [columns.join(','), ...records.map((record) => {
        const payload = record.payload as Record<string, unknown>;
        return columns.map((key) => cell(payload[key])).join(',');
      })];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="weather-subscription-${item.id}.csv"`);
      return res.send(lines.join('\r\n'));
    } catch (error) {
      console.error('Subscription download failed', error);
      return res.status(500).json({ error: 'Unable to prepare the subscribed dataset.' });
    }
  });

  return router;
}

export async function processSubscriptionWebhook(
  prisma: PrismaClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== 'subscription') return false;
    const recordId = session.metadata?.marketplaceSubscriptionId;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!recordId || !subscriptionId || !session.customer) throw new Error('Subscription Checkout session is missing its references.');
    const stored = await prisma.marketplaceSubscription.findUnique({ where: { id: recordId } });
    if (!stored || stored.buyerId !== session.metadata?.buyerId || stored.datasetId !== session.metadata?.datasetId ||
        session.client_reference_id !== stored.id) {
      throw new Error('Subscription Checkout session does not match the stored subscription.');
    }
    const remote = await stripe.subscriptions.retrieve(subscriptionId);
    await prisma.marketplaceSubscription.update({
      where: { id: recordId },
      data: {
        stripeSubscriptionId: remote.id,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer.id,
        status: remote.status.toUpperCase(),
        currentPeriodEnd: periodEnd(remote),
        cancelAtPeriodEnd: remote.cancel_at_period_end,
      },
    });
    return true;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const remote = event.data.object as Stripe.Subscription;
    const recordId = remote.metadata?.marketplaceSubscriptionId;
    if (!recordId) return false;
    await prisma.marketplaceSubscription.updateMany({
      where: { id: recordId, stripeSubscriptionId: remote.id },
      data: {
        status: remote.status.toUpperCase(),
        currentPeriodEnd: periodEnd(remote),
        cancelAtPeriodEnd: remote.cancel_at_period_end,
      },
    });
    return true;
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
    const remoteId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (!remoteId) return false;
    await prisma.marketplaceSubscription.updateMany({
      where: { stripeSubscriptionId: remoteId },
      data: { status: event.type === 'invoice.paid' ? 'ACTIVE' : 'PAST_DUE' },
    });
    return true;
  }
  return false;
}

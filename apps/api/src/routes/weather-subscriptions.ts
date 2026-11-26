import express from 'express';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { z } from 'zod';

type AuthReq = express.Request & { user?: User };
type PlanKey = 'starter' | 'team' | 'multi_site';

export const WEATHER_PLANS: Record<PlanKey, { name: string; amountCents: number }> = {
  starter: { name: 'Weather Planning — Starter', amountCents: 1900 },
  team: { name: 'Weather Planning — Team', amountCents: 3900 },
  multi_site: { name: 'Weather Planning — Multi-site', amountCents: 5900 },
};

const checkoutSchema = z.object({
  planKey: z.enum(['starter', 'team', 'multi_site']),
});

function isTestModeEnabled() {
  if (process.env.WEATHER_SUBSCRIPTIONS_TEST_MODE_ENABLED !== 'true') return false;
  if (process.env.VERCEL_ENV === 'production') return false;
  const key = process.env.VERCEL_ENV === 'preview'
    ? process.env.STRIPE_SECRET_TEST_KEY
    : process.env.STRIPE_SECRET_KEY;
  return Boolean(key?.startsWith('sk_test_') && process.env.STRIPE_WEBHOOK_SECRET);
}

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  return typeof subscription.current_period_end === 'number'
    ? new Date(subscription.current_period_end * 1000)
    : null;
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

async function saveSubscription(
  prisma: PrismaClient,
  subscription: Stripe.Subscription,
  userIdHint?: string,
  planKeyHint?: string,
) {
  const existing = await prisma.weatherSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  const userId = userIdHint || subscription.metadata?.userId || existing?.userId;
  const planKey = planKeyHint || subscription.metadata?.planKey || existing?.planKey;
  const stripeCustomerId = customerId(subscription.customer);
  if (!userId || !planKey || !stripeCustomerId || !(planKey in WEATHER_PLANS)) {
    throw new Error('Subscription is missing a valid customer, user, or plan reference.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new Error('Subscription owner does not exist.');

  return prisma.weatherSubscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
      planKey,
      status: subscription.status,
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripeCustomerId,
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
      planKey,
      status: subscription.status,
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export function createWeatherSubscriptionsRouter(
  prisma: PrismaClient,
  auth: express.RequestHandler,
  getStripe: () => Stripe | null,
) {
  const router = express.Router();

  router.get('/status', auth, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const subscription = await prisma.weatherSubscription.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
      });
      const hasAccess = Boolean(subscription && ['active', 'trialing'].includes(subscription.status));
      return res.json({
        hasAccess,
        subscription: subscription ? {
          planKey: subscription.planKey,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        } : null,
      });
    } catch (error) {
      console.error('Weather subscription status failed', error);
      return res.status(500).json({ error: 'Unable to load subscription status.' });
    }
  });

  router.post('/checkout', auth, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'An active marketplace account is required.' });
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a valid weather plan.' });
    if (!isTestModeEnabled()) {
      return res.status(503).json({ error: 'Weather subscription test checkout is not enabled. No payment was taken.' });
    }
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'A test-mode Stripe connection is not available.' });

    try {
      const existing = await prisma.weatherSubscription.findFirst({
        where: { userId: user.id, status: { in: ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'] } },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) return res.status(409).json({ error: 'An existing subscription needs to be managed before starting another.' });

      const prior = await prisma.weatherSubscription.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { stripeCustomerId: true },
      });
      const plan = WEATHER_PLANS[parsed.data.planKey];
      const baseUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        ...(prior?.stripeCustomerId ? { customer: prior.stripeCustomerId } : { customer_email: user.email }),
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: plan.amountCents,
            recurring: { interval: 'month' },
            product_data: { name: plan.name, description: 'Weather-planning pilot subscription. Test mode only.' },
          },
        }],
        metadata: { userId: user.id, planKey: parsed.data.planKey, product: 'weather_planning' },
        subscription_data: { metadata: { userId: user.id, planKey: parsed.data.planKey, product: 'weather_planning' } },
        success_url: `${baseUrl}/weather-pilot?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/weather-pilot?subscription=cancelled`,
      }, { idempotencyKey: `weather-subscription-${user.id}-${randomUUID()}` });
      if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
      return res.status(201).json({ checkoutUrl: session.url, mode: 'test', planKey: parsed.data.planKey });
    } catch (error) {
      console.error('Weather subscription checkout failed', error);
      return res.status(502).json({ error: 'Unable to start test checkout. No payment was confirmed.' });
    }
  });

  router.post('/portal', auth, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (!isTestModeEnabled()) return res.status(503).json({ error: 'Weather subscription test billing is not enabled.' });
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'A test-mode Stripe connection is not available.' });
    try {
      const subscription = await prisma.weatherSubscription.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
      });
      if (!subscription) return res.status(404).json({ error: 'No weather subscription is linked to this account.' });
      const baseUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
      const portal = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${baseUrl}/weather-pilot`,
      });
      return res.json({ portalUrl: portal.url, mode: 'test' });
    } catch (error) {
      console.error('Weather subscription billing portal failed', error);
      return res.status(502).json({ error: 'Unable to open test billing management.' });
    }
  });

  return router;
}

export async function processWeatherSubscriptionStripeEvent(
  prisma: PrismaClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  const isCheckout = event.type === 'checkout.session.completed';
  const isSubscription = event.type.startsWith('customer.subscription.');
  const isInvoice = event.type === 'invoice.paid' || event.type === 'invoice.payment_failed';
  if (!isCheckout && !isSubscription && !isInvoice) return false;

  try {
    await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (isUniqueConflict(error)) return true;
    throw error;
  }

  try {
    if (isCheckout) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || session.metadata?.product !== 'weather_planning') return true;
      const userId = session.metadata?.userId;
      const planKey = session.metadata?.planKey;
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
      if (!userId || !planKey || !(planKey in WEATHER_PLANS) || !subscriptionId) {
        throw new Error('Completed subscription checkout is missing its expected metadata.');
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata?.userId !== userId || subscription.metadata?.planKey !== planKey) {
        throw new Error('Stripe subscription metadata does not match the checkout session.');
      }
      await saveSubscription(prisma, subscription, userId, planKey);
    } else if (isSubscription) {
      const subscription = event.data.object as Stripe.Subscription;
      const existing = await prisma.weatherSubscription.findUnique({ where: { stripeSubscriptionId: subscription.id } });
      if (subscription.metadata?.product !== 'weather_planning' && !existing) return true;
      await saveSubscription(prisma, subscription);
    } else {
      const invoice = event.data.object as unknown as { subscription?: string | { id: string } | null };
      const subscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const existing = await prisma.weatherSubscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
        if (subscription.metadata?.product !== 'weather_planning' && !existing) return true;
        await saveSubscription(prisma, subscription);
      }
    }
    return true;
  } catch (error) {
    await prisma.stripeWebhookEvent.deleteMany({ where: { id: event.id } });
    throw error;
  }
}

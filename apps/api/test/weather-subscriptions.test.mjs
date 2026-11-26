import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/weather-subscriptions.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20261126120000_weather_subscriptions/migration.sql', import.meta.url), 'utf8');

test('weather subscription plans are monthly hypotheses with fixed server-side prices', () => {
  assert.match(route, /starter: \{ name: 'Weather Planning — Starter', amountCents: 1900 \}/);
  assert.match(route, /team: \{ name: 'Weather Planning — Team', amountCents: 3900 \}/);
  assert.match(route, /multi_site: \{ name: 'Weather Planning — Multi-site', amountCents: 5900 \}/);
  assert.match(route, /recurring: \{ interval: 'month' \}/);
  assert.match(route, /z\.enum\(\['starter', 'team', 'multi_site'\]\)/);
});

test('weather subscription checkout is opt-in test mode and cannot run on production', () => {
  assert.match(route, /WEATHER_SUBSCRIPTIONS_TEST_MODE_ENABLED !== 'true'/);
  assert.match(route, /process\.env\.VERCEL_ENV === 'production'/);
  assert.match(route, /key\?\.startsWith\('sk_test_'\)/);
  assert.match(route, /mode: 'subscription'/);
  assert.match(route, /No payment was taken/);
});

test('subscription access is granted only from verified server-side subscription status', () => {
  assert.match(route, /\['active', 'trialing'\]\.includes\(subscription\.status\)/);
  assert.match(route, /processWeatherSubscriptionStripeEvent/);
  assert.match(api, /stripe\.webhooks\.constructEvent/);
  assert.match(api, /constructEvent\(rawBody, signature, webhookSecret\)/);
  assert.match(api, /processWeatherSubscriptionStripeEvent\(prisma, stripe, event\)/);
});

test('subscription lifecycle and duplicate webhook events are persisted', () => {
  assert.match(route, /customer\.subscription\./);
  assert.match(route, /invoice\.paid/);
  assert.match(route, /invoice\.payment_failed/);
  assert.match(route, /stripeWebhookEvent\.create/);
  assert.match(route, /isUniqueConflict/);
  assert.match(route, /stripeWebhookEvent\.deleteMany/);
  assert.match(route, /billingPortal\.sessions\.create/);
  assert.match(route, /currentPeriodEnd/);
  assert.match(route, /cancelAtPeriodEnd/);
});

test('Prisma schema and SQL migration persist owner-scoped subscriptions and webhook IDs', () => {
  assert.match(schema, /model WeatherSubscription/);
  assert.match(schema, /stripeSubscriptionId\s+String\s+@unique/);
  assert.match(schema, /model StripeWebhookEvent/);
  assert.match(schema, /weatherSubscriptions WeatherSubscription\[\]/);
  assert.match(migration, /WeatherSubscription_stripeSubscriptionId_key/);
  assert.match(migration, /StripeWebhookEvent_pkey/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test('subscription routes require the existing authenticated API middleware', () => {
  assert.match(api, /createWeatherSubscriptionsRouter\(prisma, requireAuth, stripeClient\)/);
  assert.match(route, /router\.post\('\/checkout', auth/);
  assert.match(route, /router\.post\('\/portal', auth/);
  assert.match(route, /router\.get\('\/status', auth/);
});

test('pilot page exposes checkout controls only behind an explicit public preview flag', () => {
  const controls = readFileSync(new URL('../../web/app/weather-pilot/weather-subscription-test-controls.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../web/app/weather-pilot/weather-pilot.tsx', import.meta.url), 'utf8');
  assert.match(controls, /NEXT_PUBLIC_WEATHER_SUBSCRIPTIONS_TEST_ENABLED === 'true'/);
  assert.match(controls, /if \(!ENABLED\) return null/);
  assert.match(controls, /localStorage\.getItem\('auth_token'\)/);
  assert.match(controls, /Manage \/ cancel test plan/);
  assert.match(page, /WeatherSubscriptionTestControls/);
});

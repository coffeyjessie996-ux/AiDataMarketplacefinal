import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

function sectionBetween(start, end) {
  const startAt = apiSource.indexOf(start);
  assert.notEqual(startAt, -1, `Expected source marker: ${start}`);
  const endAt = apiSource.indexOf(end, startAt);
  assert.notEqual(endAt, -1, `Expected end marker: ${end}`);
  return apiSource.slice(startAt, endAt);
}

const stripeConfig = sectionBetween('const stripeClient = () => {', '// Stripe Checkout is gated');
const checkout = sectionBetween("app.post('/orders'", "// Stripe alone can confirm payment.");
const webhook = sectionBetween("app.post('/webhooks/stripe'", "// A buyer can check the server-side order state");
const statusLookup = sectionBetween("app.get('/orders/checkout-session/:sessionId'", "// Dataset delivery is generated");
const download = sectionBetween("app.get('/orders/:id/download'", "// Public marketplace figures come from persisted database records only.");

test('Preview deployments require a dedicated Stripe test key and cannot fall back to the live key', () => {
  assert.match(stripeConfig, /VERCEL_ENV === 'preview'/);
  assert.match(stripeConfig, /STRIPE_SECRET_TEST_KEY/);
  assert.match(stripeConfig, /isPreview && !secretKey\.startsWith\('sk_test_'\)/);
  assert.match(stripeConfig, /VERCEL_ENV === 'production'.*sk_live_/s);
});

test('checkout is disabled unless the explicit server-side flag is true', () => {
  assert.match(checkout, /STRIPE_CHECKOUT_ENABLED !== 'true'/);
  assert.match(checkout, /status\(503\)/);
});

test('checkout requires a published, priced, non-restricted factory dataset', () => {
  assert.match(checkout, /status: 'PUBLISHED'/);
  assert.match(checkout, /priceCents: \{ gt: 0 \}/);
  assert.match(checkout, /licenseType: \{ not: 'RESTRICTED' \}/);
  assert.match(checkout, /tags: \{ has: 'factory:v1' \}/);
  assert.match(checkout, /nonDemoDatasetFilter/);
});

test('checkout requires attached source records and seller rights-review evidence', () => {
  assert.match(checkout, /source-record-id:/);
  assert.match(checkout, /new Set\(includedRecordIds\)/);
  assert.match(checkout, /license-review-status:seller_reviewed/);
  assert.match(checkout, /license-review-evidence:/);
  assert.match(checkout, /source: 'usaspending.gov'/);
});

test('checkout session is tied to the order and protected by an idempotency key', () => {
  assert.match(checkout, /client_reference_id: order\.id/);
  assert.match(checkout, /metadata: \{ orderId: order\.id, datasetId: dataset\.id, buyerId: user\.id \}/);
  assert.match(checkout, /idempotencyKey: `marketplace-order-\$\{order\.id\}`/);
});

test('raw request bytes are captured before the Stripe webhook route is registered', () => {
  const rawBodyCaptureAt = apiSource.indexOf('app.use(express.json({');
  const webhookRouteAt = apiSource.indexOf("app.post('/webhooks/stripe'");
  assert.notEqual(rawBodyCaptureAt, -1);
  assert.notEqual(webhookRouteAt, -1);
  assert.ok(rawBodyCaptureAt < webhookRouteAt, 'JSON raw-body capture must precede webhook registration');
  assert.match(apiSource.slice(rawBodyCaptureAt, webhookRouteAt), /rawBody\?: Buffer/);
});

test('webhook verifies Stripe signature before it can mark an order paid', () => {
  assert.match(webhook, /stripe\.webhooks\.constructEvent\(rawBody, signature, webhookSecret\)/);
  const signatureCheckAt = webhook.indexOf('constructEvent(');
  const paidUpdateAt = webhook.indexOf("data: \{ status: 'PAID' \}");
  assert.notEqual(signatureCheckAt, -1);
  assert.notEqual(paidUpdateAt, -1);
  assert.ok(signatureCheckAt < paidUpdateAt, 'signature verification must happen before the paid-state update');
  assert.match(webhook, /session\.payment_status !== 'paid'/);
  assert.match(webhook, /session\.amount_total === order\.totalCents/);
  assert.match(webhook, /session\.currency\?\.toLowerCase\(\) === order\.currency\.toLowerCase\(\)/);
  assert.match(webhook, /session\.metadata\?\.buyerId === order\.buyerId/);
  assert.match(webhook, /session\.metadata\?\.datasetId === order\.datasetId/);
});

test('browser return lookup cannot itself mark an order paid', () => {
  assert.doesNotMatch(statusLookup, /order\.update\(/);
  assert.doesNotMatch(statusLookup, /order\.updateMany\(/);
  assert.match(statusLookup, /where: \{ id: orderId, buyerId: user\.id \}/);
});

test('download requires this buyer to have a paid order and an eligible published dataset', () => {
  assert.match(download, /buyerId: user\.id, status: 'PAID'/);
  assert.match(download, /order\.dataset\.status !== 'PUBLISHED'/);
  assert.match(download, /order\.dataset\.licenseType === 'RESTRICTED'/);
  assert.match(download, /factory:v1/);
  assert.match(download, /license-review-status:seller_reviewed/);
  assert.match(download, /license-review-evidence:/);
});

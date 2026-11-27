import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../src/services/maintenance.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/maintenance.ts', import.meta.url), 'utf8');
const cron = readFileSync(new URL('../src/routes/cron.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../../web/app/operations/page.tsx', import.meta.url), 'utf8');

test('maintenance only reconciles stale RUNNING tasks and does not replay source jobs', () => {
  assert.match(service, /status: 'RUNNING'/);
  assert.match(service, /STALE_AGENT_TASK_MINUTES = 120/);
  assert.match(service, /status: 'FAILED'/);
  assert.match(service, /did not rerun collectors or modify marketplace\/customer\/payment data/);
  assert.doesNotMatch(service, /fetch\(|stripe|supplierResearchRecord\.delete/);
});

test('maintenance endpoints require authenticated admin access', () => {
  assert.match(route, /router\.use\(auth\)/);
  assert.match(route, /user\.role !== 'admin'/);
  assert.match(route, /router\.post\('\/run'/);
});

test('scheduled maintenance is protected by CRON_SECRET', () => {
  assert.match(cron, /router\.get\('\/maintenance\/reconcile'/);
  assert.match(cron, /authorized\(req\.headers\.authorization, secret\)/);
  assert.match(dashboard, /AI Maintenance Team/);
  assert.match(dashboard, /Run maintenance check/);
});

test('maintenance investigator classifies failures without retrying tasks', () => {
  assert.match(service, /classifyMaintenanceFailure/);
  assert.match(service, /inspectRecentMaintenanceFailures/);
  assert.match(route, /failureDiagnostics/);
});

test('maintenance cron endpoint has a per-IP request limit', () => {
  assert.match(cron, /allowMaintenanceRequest\(req\.ip\)/);
  assert.match(cron, /status\(429\)/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipelineSource = readFileSync(new URL('../src/routes/pipeline.ts', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../../web/app/pipeline/page.tsx', import.meta.url), 'utf8');

function sectionBetween(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `Expected source marker: ${start}`);
  const endAt = source.indexOf(end, startAt);
  assert.notEqual(endAt, -1, `Expected end marker: ${end}`);
  return source.slice(startAt, endAt);
}

test('AI sales drafts reject public job and government opportunities', () => {
  const route = sectionBetween(pipelineSource, "router.post('/leads/:id/ai-draft'", "router.post('/leads/:id/close-plan'");
  assert.match(route, /isExternalWorkOpportunity\(lead\.source\)/);
  assert.match(route, /not a sales prospect/i);
});

test('AI close plans reject public job and government opportunities', () => {
  const route = sectionBetween(pipelineSource, "router.post('/leads/:id/close-plan'", "router.patch('/leads/:id'");
  assert.match(route, /isExternalWorkOpportunity\(lead\.source\)/);
  assert.match(route, /official application or bid process/i);
});

test('sales pipeline identifies opportunity types and links to original listings', () => {
  assert.match(uiSource, /PUBLIC JOB OPPORTUNITY/);
  assert.match(uiSource, /GOVERNMENT SOLICITATION/);
  assert.match(uiSource, /View original opportunity/);
  assert.match(uiSource, /Use official application process/);
  assert.match(uiSource, /Not applicable to work listings/);
  assert.match(uiSource, /Not a sales forecast/);
});

test('sales pipeline does not present saved opportunities as confirmed buyers or revenue', () => {
  assert.match(uiSource, /not a confirmed buyer, contract award to you, or earned revenue/i);
  assert.match(uiSource, /Forecasts are not actual revenue or profit/i);
  assert.match(uiSource, /Government award amounts are shown separately/i);
});

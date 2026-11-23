import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../src/services/ai-research-agent.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/ai-research-agent.ts', import.meta.url), 'utf8');

test('quota exhaustion switches the rest of a batch to the no-cost fallback', () => {
  assert.match(service, /options: \{ forceRulesFallback\?: boolean \}/);
  assert.match(service, /if \(!apiKey \|\| options\.forceRulesFallback\)/);
  assert.match(route, /forceRulesFallback: blockedByQuota/);
  assert.match(route, /researchResult\.fallbackReason === 'provider_quota'\) blockedByQuota = true/);
  assert.match(route, /OpenAI quota is exhausted; remaining records used the no-cost rules fallback/);
});

test('the agent reports the actual per-run batch limit', () => {
  assert.match(route, /const MAX_RECORDS_PER_RUN = 10/);
  assert.match(route, /slice\(0, MAX_RECORDS_PER_RUN\)/);
  assert.match(route, /perRunLimit: MAX_RECORDS_PER_RUN/);
  assert.match(route, /Maximum \$\{MAX_RECORDS_PER_RUN\} records are processed per run/);
});

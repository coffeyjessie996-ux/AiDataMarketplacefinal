import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../src/services/ai-research-agent.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/ai-research-agent.ts', import.meta.url), 'utf8');

test('OpenAI quota exhaustion switches the rest of a batch to Gemini when configured', () => {
  assert.match(service, /GEMINI_API_KEY/);
  assert.match(service, /forceRulesFallback\?: boolean; skipOpenAi\?: boolean/);
  assert.match(service, /if \(openAiKey && !options\.skipOpenAi\)/);
  assert.match(service, /generativelanguage\.googleapis\.com/);
  assert.match(service, /analysisMethod: 'gemini'/);
  assert.match(route, /skipOpenAi: blockedByQuota/);
  assert.match(route, /researchResult\.fallbackReason === 'provider_quota'\) blockedByQuota = true/);
  assert.match(route, /Gemini backup when configured/);
});

test('the agent reports the actual per-run batch limit', () => {
  assert.match(route, /const MAX_RECORDS_PER_RUN = 10/);
  assert.match(route, /LIMIT \$\{MAX_RECORDS_PER_RUN\}/);
  assert.match(route, /payload"->'aiResearchAnalysis' IS NULL/);
  assert.doesNotMatch(route, /take: 500/);
  assert.match(route, /perRunLimit: MAX_RECORDS_PER_RUN/);
  assert.match(route, /Maximum \$\{MAX_RECORDS_PER_RUN\} records are processed per run/);
  assert.match(route, /AI research run found no unanalyzed records/);
});


test('Gemini provider failures retain sanitized status diagnostics for production diagnosis', () => {
  assert.match(service, /providerStatus\?: number/);
  assert.match(service, /providerDiagnostic\?: string/);
  assert.match(service, /providerStatus: response.status/);
  assert.match(service, /replaceAll\(geminiKey, '\\[redacted\\]'\)/);
  assert.match(route, /researchResult\.providerStatus/);
  assert.match(route, /researchResult\.providerDiagnostic/);
});

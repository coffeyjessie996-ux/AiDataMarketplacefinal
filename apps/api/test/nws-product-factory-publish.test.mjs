import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/data-bank.ts', import.meta.url), 'utf8');
const validatorStart = source.indexOf('function isNwsForecastRecord');
const routerStart = source.indexOf('export function createDataBankRouter');
const publishStart = source.indexOf("router.post('/products/:id/publish'");
const recordsStart = source.indexOf("router.get('/products/:id/records'", publishStart);
const downloadStart = source.indexOf("router.get('/products/:id/download'");
const validator = source.slice(validatorStart, routerStart);
const publish = source.slice(publishStart, recordsStart);
const download = source.slice(downloadStart, source.indexOf('return router;', downloadStart));

test('Product Factory publishing is limited to approved NWS point/grid forecast records', () => {
  assert.ok(validatorStart >= 0 && routerStart > validatorStart);
  assert.match(validator, /url\.hostname === 'api\.weather\.gov'/);
  assert.match(validator, /gridpoints/);
  assert.match(validator, /sourceTermsUrl/);
  assert.match(validator, /forecastUpdatedAt/);
  assert.match(publish, /sourceNames\.length !== 1 \|\| sourceNames\[0\] !== 'nws_api_forecasts'/);
  assert.match(publish, /isCommercialReuseApproved\(source\)/);
  assert.match(publish, /source: 'nws_api_forecasts'/);
  assert.match(publish, /isNwsForecastRecord\(record\)/);
  assert.doesNotMatch(publish, /source: 'usaspending\.gov'/);
});

test('published NWS product downloads retain attribution and require owner or paid buyer access', () => {
  assert.match(download, /const isOwner = product\.sellerId === user\.id/);
  assert.match(download, /status: 'PAID'/);
  assert.match(download, /sourceNames\[0\] !== 'nws_api_forecasts'/);
  assert.match(download, /source: 'nws_api_forecasts'/);
  assert.match(download, /source_terms_url/);
  assert.match(download, /non_endorsement_notice/);
  assert.match(download, /payload\.attribution/);
  assert.match(download, /payload\.sourceTermsUrl/);
  assert.match(download, /\.test\(text\)/);
});

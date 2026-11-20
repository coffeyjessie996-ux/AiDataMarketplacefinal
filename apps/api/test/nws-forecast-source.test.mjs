import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rights = readFileSync(new URL('../src/services/source-rights.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/data-bank.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../web/app/data-bank/page.tsx', import.meta.url), 'utf8');
const register = readFileSync(new URL('../../../docs/compliance/SOURCE_RIGHTS_REGISTER.md', import.meta.url), 'utf8');

test('only NWS-issued point/grid forecasts receive narrow commercial reuse approval', () => {
  const block = rights.split("'nws_api_forecasts': {")[1]?.split("  'usaspending.gov': {")[0] ?? '';
  assert.match(block, /commercial_reuse_approved/);
  assert.match(block, /api\.weather\.gov/);
  assert.match(block, /third-party station observations/);
  assert.match(register, /NWS API point\/grid forecasts/);
});

test('forecast collector requires authentication and valid coordinates but keeps the draft private', () => {
  const collector = route.split("router.post('/nws-forecasts'")[1]?.split("router.get('/products'")[0] ?? '';
  assert.match(collector, /if \(!user\) return res\.status\(401\)/);
  assert.match(collector, /latitude: z\.number\(\)\.min\(-90\)\.max\(90\)/);
  assert.match(collector, /longitude: z\.number\(\)\.min\(-180\)\.max\(180\)/);
  assert.match(collector, /status: 'DRAFT'/);
});

test('collector only follows HTTPS api.weather.gov grid forecast URLs', () => {
  const collector = route.split("router.post('/nws-forecasts'")[1]?.split("router.get('/products'")[0] ?? '';
  assert.match(collector, /validatedForecastUrl\.hostname !== 'api\.weather\.gov'/);
  assert.match(collector, /validatedForecastUrl\.pathname\.includes\('\/gridpoints\/'\)/);
  assert.doesNotMatch(collector, /\/observations/);
});

test('forecast data is saved with source IDs and a restricted, zero-price draft', () => {
  const collector = route.split("router.post('/nws-forecasts'")[1]?.split("router.get('/products'")[0] ?? '';
  assert.match(collector, /source: 'nws_api_forecasts'/);
  assert.match(collector, /source_sourceRecordId/);
  assert.match(collector, /status: 'DRAFT'/);
  assert.match(collector, /licenseType: 'RESTRICTED'/);
  assert.match(collector, /priceCents: 0/);
  assert.match(collector, /No listing, price, auction, checkout, or payment was created/);
});

test('Data Bank exposes a manual collector and the non-endorsement disclosure', () => {
  assert.match(page, /Collect NWS forecast & create draft/);
  assert.match(page, /No NOAA\/NWS endorsement/);
  assert.match(page, /private, restricted, \$0 draft/);
});


test('weather brief is owner-scoped and derives a sourced planning summary from NWS records', () => {
  const collector = route.split("router.get('/weather-brief'")[1]?.split("router.get('/products'")[0] ?? '';
  assert.match(collector, /sellerId: user\.id/);
  assert.match(collector, /source: 'nws_api_forecasts'/);
  assert.match(collector, /maxPrecipitationChance/);
  assert.match(collector, /maxWindMph/);
  assert.match(collector, /does not imply NOAA\/NWS endorsement/);
  assert.match(page, /Weather operations planning brief/);
  assert.match(page, /Print \/ save as PDF/);
  assert.match(page, /not cleared for redistribution/);
});


test('public weather pilot preview fetches only official NWS point/grid forecast data', () => {
  const api = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const preview = api.split("app.get('/weather-pilot/preview'")[1]?.split("app.post('/auth/register'")[0] ?? '';
  assert.match(preview, /api\\.weather\\.gov/);
  assert.match(preview, /validatedForecastUrl\\.hostname !== 'api\\.weather\\.gov'/);
  assert.match(preview, /validatedForecastUrl\\.pathname\\.includes\\('\/gridpoints\/'\)/);
  assert.match(preview, /Cache-Control/);
  assert.doesNotMatch(preview, /prisma\\./);
  assert.match(api, /'weather-planning'/);
});

test('public weather pilot clearly attributes the live sample and separates consent from unrelated marketing', () => {
  const pilot = readFileSync(new URL('../../web/app/weather-pilot/weather-pilot.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../web/app/weather-pilot/page.tsx', import.meta.url), 'utf8');
  assert.match(pilot, /NWS point forecast/);
  assert.match(pilot, /No NOAA\\/NWS endorsement/);
  assert.match(pilot, /not an official NWS product/);
  assert.match(pilot, /not consent to unrelated marketing/);
  assert.match(pilot, /budgetRange/);
  assert.match(page, /canonical: '\/weather-pilot'/);
});

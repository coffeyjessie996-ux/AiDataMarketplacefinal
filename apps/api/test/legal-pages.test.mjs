import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../web/app/', import.meta.url);
const layout = readFileSync(new URL('layout.tsx', root), 'utf8');
const privacy = readFileSync(new URL('privacy/page.tsx', root), 'utf8');
const terms = readFileSync(new URL('terms/page.tsx', root), 'utf8');

test('legal pages are linked globally and provide a contact channel', () => {
  assert.match(layout, /href="\/privacy"/);
  assert.match(layout, /href="\/terms"/);
  assert.match(privacy, /Privacy Policy/);
  assert.match(terms, /Terms of Service/);
  assert.match(privacy, /coffeyjessie996@gmail\.com/);
  assert.match(terms, /coffeyjessie996@gmail\.com/);
});

test('seller and buyer terms preserve source rights and payment verification safeguards', () => {
  assert.match(terms, /Public availability does not automatically mean/);
  assert.match(terms, /source-specific approval/);
  assert.match(terms, /receives and verifies the provider's payment confirmation/);
  assert.match(terms, /human review and authorization/);
  assert.match(privacy, /Stripe/);
  assert.match(privacy, /connection tokens in encrypted form/);
});

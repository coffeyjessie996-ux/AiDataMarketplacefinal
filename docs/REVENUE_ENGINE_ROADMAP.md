# Revenue Engine Roadmap

## Commercial objective

Build a low-cost, evidence-led business intelligence product around public supplier and federal-award data. Optimize for repeat buyers and recurring value, not the number of scraped rows. Revenue is recognized only after a real payment is confirmed.

## First product wedge: federal supplier intelligence

Start with one narrow product that the existing database can support:

- Searchable supplier profiles built from public USAspending award records.
- Award history, agencies, NAICS/PSC classifications, performance locations, award dates, and source links when present in the source record.
- Clear retrieval dates and record-level provenance.
- Filters that help a buyer answer a commercial question, such as which suppliers recently won awards in a particular category or geography.
- Scheduled refreshes only after source rate limits, costs, and data-use terms are reviewed.

The current records are award-recipient intelligence. They are not proof that a supplier is currently active, available, qualified, or looking for subcontract work. Award amounts are not marketplace revenue.

## Additional public source: SAM.gov opportunities

The scheduled SAM.gov Get Opportunities Public API job stores recent public solicitation, combined synopsis/solicitation, and sources-sought notices as a separate research source. It refreshes a bounded recent date window and deduplicates by notice ID. The SAM.gov API key is read only from the server-side `SAM_API_KEY` environment variable.

These records are opportunity intelligence, not supplier verification or buyer leads. Government contracting-officer points of contact must not be treated as marketing prospects. A SAM.gov API key has account-specific daily request limits, so keep the scheduled job to one request per day unless the account's documented quota is confirmed.

## Buyer hypotheses to validate

Prioritize interviews and small paid pilots with:

1. Small and mid-sized government contractors seeking teaming and subcontractor research.
2. Business development teams that need agency, category, and geography-based prospect research.
3. Procurement consultants and market researchers preparing opportunity reports.

Do not build separate products for every audience before one buyer group pays.

## Monetization experiments

Test willingness to pay before investing in expensive infrastructure:

- **One-time research brief:** a tightly scoped supplier or market report with source links and an as-of date.
- **Monthly intelligence subscription:** saved searches, refreshed supplier profiles, and change alerts.
- **Team/API plan:** programmatic access, usage limits, and documented coverage for repeat commercial users.

Prices should be tested with real prospects; do not represent suggested prices as market-validated. Start with a small paid pilot and measure renewal intent.

## Acquisition and data-quality pipeline

1. Discover approved public sources and record their terms, access limits, and update cadence.
2. Fetch records with timeouts, bounded response sizes, and rate limits.
3. Normalize names, identifiers, dates, amounts, NAICS/PSC codes, and locations.
4. Deduplicate on stable source identifiers; preserve the source record ID and source URL.
5. Track retrieval time, source, extraction method, and missing fields.
6. Score completeness and freshness separately from commercial relevance.
7. Review licensing, privacy, and source restrictions before publication.
8. Publish only curated products with a clear schema, sample, coverage statement, update date, and license.

A scraped webpage snippet is a research snapshot, not a verified supplier record or a sellable dataset by itself.

## Sales automation

Automate research and workflow first; automate outbound sending only when prerequisites are satisfied.

- Prioritize accounts using fit signals from public, permitted business data.
- Keep contact provenance, verification status, lawful-basis/consent notes, and suppression status.
- Never guess email addresses or use restricted/non-public contact fields.
- Require a verified sender identity and configured email provider.
- Include accurate sender identification and a working opt-out; suppress opt-outs, complaints, and hard bounces.
- Deduplicate campaigns and use idempotency keys to prevent duplicate sends.
- Stop follow-ups after a reply, opt-out, bounce, or conversion.
- Record sent, delivered, bounced, replied, proposal, won/lost, and paid events separately.

The app currently has no live email provider integration. Do not send prospect emails until the provider, sender identity, contact data, and compliance controls are configured and tested.

## Revenue truth and dashboard rules

Keep these measures separate:

- **Research records:** source records collected.
- **Leads:** companies imported into the sales pipeline.
- **Products/listings:** curated products actually available to buy.
- **Orders:** checkout attempts or orders, with status shown.
- **Gross sales:** confirmed paid orders only.
- **Refunds and fees:** separate deductions.
- **Net revenue:** paid sales less refunds and applicable fees.
- **Payouts:** actual processor/bank payout states.

Never count award values, lead counts, wallet seed values, pending orders, or forecast pipeline as revenue. A forecast may be shown only when clearly labeled as an estimate with its assumptions.

## Low-cost execution order

### Now
- Preserve the existing login, dashboard, supplier records, and lead pipeline.
- Persist successful public research snapshots with stable deduplication keys.
- Add source provenance and retrieval dates to research workflows.
- Validate API builds and deployment before enabling production behavior.

### Next
- Add data-quality and freshness reporting.
- Add a curated product builder and downloadable buyer sample.
- Add a simple product page with schema, coverage, license, update date, and clear pricing.
- Add real checkout and webhook-confirmed order accounting before calling anything revenue.

### After buyer validation
- Add scheduled refresh jobs with per-source budgets and backoff.
- Add verified-contact workflow, suppression lists, and provider webhooks.
- Add customer subscriptions, API keys, usage metering, and renewal reporting.
- Add AI assistance for classification, summaries, and buyer-specific research only when an actual model provider and budget are configured.

## Launch gates

Do not claim the business is automated or revenue-generating until all applicable checks pass:

- A source can be collected repeatedly without duplicate inflation.
- Each published field has traceable provenance.
- Product records pass quality and licensing review.
- A buyer can preview and purchase the actual deliverable.
- Payment confirmation is verified by a signed provider webhook.
- Refunds, fees, and payouts reconcile with provider records.
- Outbound email is sent only to eligible, verified contacts and opt-outs are honored.
- Production dashboard figures reconcile to database and payment-provider records.

# Weather subscription pilot

## Goal

Validate a recurring weather-planning service for small outdoor-work businesses before enabling paid subscriptions. This is an extension of the existing marketplace and existing `/weather-pilot` page, not a replacement dashboard.

## Initial customer segments

1. Roofing and exterior contractors.
2. Landscaping and lawn-care companies.
3. Painting, pressure-washing, and other outdoor field-service businesses.

Start with one or two service areas and a small cohort. Do not interpret competitor pricing, page views, or inquiry submissions as proof of willingness to pay.

## Proposed price tests

These are hypotheses to validate, not active offers or guaranteed revenue:

- Starter: $19/month proposed — one saved work area and a daily forecast brief.
- Team: $39/month proposed — multiple work areas and team-ready planning summaries.
- Multi-site: $59+/month proposed — several crews or service areas; scope and price require customer discovery.

The current pilot page collects interest only. It does not collect payment or create a subscription.

## Demand validation gates

Before building a full paid service:

- Conduct at least 10–15 genuine conversations with operators in the target segments.
- Aim for at least five qualified businesses willing to join a paid pilot at a stated price.
- Record business type, locations/number of crews, scheduling problem, desired forecast lead time, selected price hypothesis, and explicit contact consent.
- Track inquiry-to-conversation, conversation-to-paid-pilot, active usage, cancellation, and renewal.
- Treat a paid pilot and a second-month renewal as stronger evidence than a waitlist entry.

Do not buy, harvest, guess, or scrape email lists. Use inbound inquiries, referrals, or other permission-based acquisition. A weather-pilot inquiry permits a response to that request only; it is not blanket marketing consent.

## Source and legal boundary

The current source-rights register narrowly approves NWS-issued point/grid forecast data from `api.weather.gov` for commercial reuse subject to the documented safeguards. Keep the pilot restricted to those endpoints and follow the register's attribution, User-Agent, caching/request-frequency, metadata, and non-endorsement requirements.

Do not add third-party weather APIs, station observations, radar imagery, satellite imagery, scraped weather pages, or other feeds without a separate documented rights review. The product must clearly distinguish NWS source data from our own planning analysis. Do not imply NOAA/NWS endorsement, issue safety determinations, or guarantee jobsite conditions. Users must consult official alerts, site conditions, and their own safety procedures.

## Product sequence

1. **Pilot validation:** existing public NWS preview, price hypothesis cards, permission-based inquiry form, and seller/admin inquiry inbox.
2. **Paid product foundation:** customer-owned locations, forecast refresh/caching, source timestamps, daily briefs, configurable non-safety planning prompts, and notification preferences.
3. **Recurring billing:** Stripe subscription checkout, verified webhook lifecycle, server-side plan entitlements, billing portal/cancellation, and reconciliation against verified payments.
4. **Controlled release:** limited paying cohort; monitor usage, support load, churn, and renewals before expanding.

## Billing release checklist

Do not enable checkout until all of these are implemented and verified:

- A real Stripe recurring price and product configured in the correct live/test mode.
- Checkout sessions created server-side for authenticated customers.
- Webhook signature verification using the raw request body and configured webhook secret.
- Idempotent processing of checkout completion, invoice paid/payment failed, subscription updated/deleted, and refund/dispute events as applicable.
- Server-side entitlement checks; never trust a client-supplied plan or payment-success redirect.
- Clear price, billing interval, renewal, cancellation, and refund terms before purchase.
- Working cancellation and customer billing management.
- Tests for duplicate, delayed, out-of-order, and failed webhook events.
- Test-mode end-to-end verification before live mode.

The existing one-time marketplace checkout or wallet display must not be assumed to provide recurring billing or seller payouts.

## Success metrics

Report only observed values: qualified inquiries, completed conversations, pilot customers, paid subscriptions, gross recurring revenue from verified invoices, failed payments, active usage, cancellations, and renewals. Keep forecast projections and price hypotheses visibly separate from actual revenue.


## Implemented subscription foundation (test mode only)

The feature branch now includes a database-backed subscription record, signed Stripe webhook processing, authenticated subscription status, test Checkout, and Stripe Billing Portal routes:

- `POST /weather-subscriptions/checkout` accepts only `starter`, `team`, or `multi_site`; prices are $19, $39, and $59 per month in Stripe **test mode only**.
- `GET /weather-subscriptions/status` reports access only when a verified webhook has stored an `active` or `trialing` subscription.
- `POST /weather-subscriptions/portal` opens Stripe's test-mode customer portal for the signed-in account.
- The existing signed `POST /webhooks/stripe` endpoint processes subscription checkout, subscription lifecycle, and invoice paid/failed events with event-ID deduplication.
- Test checkout is disabled by default. It requires `WEATHER_SUBSCRIPTIONS_TEST_MODE_ENABLED=true`, a test-mode Stripe secret for the deployment environment, and the existing webhook signing secret. The API explicitly refuses this test checkout in Vercel Production.
- Preview deployments must use `STRIPE_SECRET_TEST_KEY` and the Stripe webhook signing secret configured for the preview endpoint. Never put a secret in a `NEXT_PUBLIC_` variable or in source control.

This is a backend billing foundation, not a public launch. It does not turn on checkout in production, create live prices, or prove that a buyer has paid. Before a live release, the remaining verification must include a real preview test with Stripe test cards, webhook delivery and retries, cancellation through the portal, failed invoice behavior, entitlement revocation, and a reviewed customer-facing terms/refund policy. The app's forecast product features and service levels also need to be implemented and validated before charging customers.

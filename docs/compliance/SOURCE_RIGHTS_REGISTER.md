# Source rights register and release rules

**Status: narrow approval for NWS-issued point forecasts only; all other sources remain subject to the decisions below.**

This register is an operational control, not a legal opinion or a substitute for advice from a qualified attorney. Public availability, a public API key, a FOIA release, or a government website URL does not by itself prove that a particular collection can be copied, packaged, redistributed, or resold.

## Release rule

A dataset must remain private, unpriced, and unpublished unless every source contributing to it has a documented source-specific review covering:

1. The exact API, endpoint, data fields, and collection method used.
2. The source's current terms and any incorporated third-party rights.
3. Commercial reuse, redistribution, bulk access, and derivative-product permission.
4. Privacy, personal information, confidentiality, and any opt-out or sensitive-data restrictions.
5. Attribution, non-endorsement language, rate limits, retention, and deletion requirements.
6. Evidence URL, review date, reviewer, and any written permission required from the source or rights holder.

A seller's attestation or a link to a terms page is not, by itself, a legal determination. A source is not approved merely because a record is publicly viewable.

## Current source decisions

| Source | Current decision | Reason / conditions |\n|---|---|---|
|---|---|---|
| NWS API point/grid forecasts (`api.weather.gov`) | Approved for commercial reuse within the defined scope | NWS API documentation says API information is open data, free to use for any purpose. Approval covers only NWS-issued forecast periods from `/points` and linked `/gridpoints/.../forecast`; excludes third-party station observations, imagery, other external feeds, and unreviewed datasets. Use an identifying User-Agent, sensible request frequency, valid-time labels, source attribution, and non-endorsement language. |\n| USAspending.gov | Internal research only | Public federal award data is being collected through its API. This project has not completed a field-level redistribution/commercial resale review, including any third-party material or privacy considerations. |
| SAM.gov opportunities | Paused; internal research only | The app must use only the documented public API with the correct account/API permissions. SAM.gov terms prohibit automated website scraping and restrict sensitive/FOUO data. No resale permission for this packaged product has been documented. |
| SAM.gov entity / D&B data | Do not collect or resell | SAM.gov terms state that non-open D&B data cannot be used for commercial, resale, or marketing purposes. D&B Open Data has attribution and no-bulk-redistribution restrictions. |
| Grants.gov opportunities | Internal research only | API terms allow searching, displaying, analyzing, and retrieving data; require a prominent non-endorsement notice and prohibit false representation. Commercial resale rights for packaged datasets have not been separately established. |
| Data.gov catalog | Review each dataset separately | Data.gov says most federal data is generally reusable, but dataset-specific Access & Use information controls; non-federal datasets can have different licenses. Data.gov is a catalog, not a blanket license. |
| BLS API | Review each series/source separately | BLS terms describe secondary use and require API retrieval-date citation and a disclaimer. BLS also notes that source agencies retain version control; verify original owner and third-party content before commercial packaging. |
| Generic public webpage scraping | Blocked for resale | A successful HTTP fetch does not establish permission to copy, retain, aggregate, or sell the page contents. Review website terms, robots guidance, copyright, privacy, and access restrictions first. |
| Federal R&D dataset | Restricted / private | Written confirmation of commercial resale rights has not been obtained. Keep it out of listings, auctions, and checkout. |

## Official source references reviewed

- NWS API documentation and use terms: https://www.weather.gov/documentation/services-web-api\n- NWS public-domain and non-endorsement disclaimer: https://www.weather.gov/disclaimer\n- SAM.gov Terms of Use: https://sam.gov/about/terms-of-use
- GSA SAM.gov Entity Management API documentation: https://open.gsa.gov/api/entity-api/
- Grants.gov API Terms & Conditions: https://www.grants.gov/api/terms-conditions
- Data.gov licensing policy: https://data.gov/privacy-policy/
- BLS API Terms of Service: https://www.bls.gov/developers/termsOfService.htm
- GovInfo public-domain and copyright notice: https://www.govinfo.gov/about/policies

## Sales outreach and personal-data safeguards

No automated outbound marketing email is enabled. Before enabling it, implement and test all of the following:

- Use accurate sender/from and routing details and truthful subject lines.
- Clearly identify commercial messages as advertisements and include a valid physical postal address.
- Include a clear, working opt-out method in every commercial email, including business-to-business messages.
- Keep a suppression list and honor opt-outs within 10 business days; do not sell or transfer opted-out addresses except to a service provider acting to maintain compliance.
- Do not use harvested or guessed email addresses, purchased lists of uncertain origin, or dictionary-generated addresses.
- Review contact-data provenance and permitted purpose before outreach; do not treat government contracting-officer points of contact as sales prospects.
- Collect only personal information needed for the service, restrict access, define retention/deletion periods, and secure the information.

The FTC says CAN-SPAM applies to commercial email, including business-to-business messages, and makes both the promoted business and the sending provider potentially responsible. These controls are launch blockers, not optional enhancements.

Official guidance:
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- FTC Protecting Personal Information guide: https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business

Other federal, state, and international privacy or marketing laws may apply depending on the people, data, and jurisdictions involved. Obtain qualified legal review before activating campaigns or selling identifiable contact data.

## Engineering enforcement

- New datasets created through the general API are forced to DRAFT, RESTRICTED, and $0.
- Product Factory publication, Stripe checkout, auction creation, auction discovery, and bidding require every source to be explicitly marked `commercial_reuse_approved` in `apps/api/src/services/source-rights.ts`.
- `nws_api_forecasts` is the sole narrow approved source: NWS-issued point/grid forecast periods only. The source registry explicitly excludes third-party observations and imagery. All other sources remain unapproved until a documented review is completed.
- SAM.gov scheduled opportunity collection is paused unless a separate server-side feature flag is explicitly enabled after authorization and rights review.
- Generic webpage collection requires exact hostnames in `PUBLIC_WEB_SCRAPE_ALLOWED_HOSTS`; the list must be populated only after terms, robots guidance, and permission are reviewed. Empty means scraping is paused.
- SAM.gov point-of-contact fields are not persisted as sales contact data.
- Do not change a source to approved solely to unblock sales. Record the evidence and obtain legal review first.

/**
 * Conservative source-rights register for marketplace publication.
 *
 * Public access is not the same as permission to redistribute or resell a dataset.
 * A source may be used for internal research while commercial reuse remains blocked.
 * Do not add a source to the approved set without a documented source-specific review
 * covering the exact fields, upstream contributors, privacy limits, and applicable terms.
 */
export type SourceRightsStatus = 'internal_research_only' | 'blocked' | 'commercial_reuse_approved';

export interface SourceRightsPolicy {
  status: SourceRightsStatus;
  termsUrl: string;
  reason: string;
  attributionRequired?: boolean;
  operationalNotes?: string[];
}

export const SOURCE_RIGHTS_POLICY: Readonly<Record<string, SourceRightsPolicy>> = Object.freeze({
  'nws_api_forecasts': {
    status: 'commercial_reuse_approved',
    termsUrl: 'https://www.weather.gov/documentation/services-web-api',
    reason: 'NWS API documentation explicitly states that API information is open data, free to use for any purpose. This approval is limited to NWS-issued point/grid forecast periods retrieved from api.weather.gov; it does not cover third-party station observations, third-party imagery, non-NWS material, or other NWS datasets without a separate review.',
    attributionRequired: true,
    operationalNotes: [
      'Use only the api.weather.gov /points and linked /gridpoints/.../forecast endpoints with an identifying User-Agent and reasonable request frequency.',
      'Show the NWS public-domain / non-endorsement notice and the forecast issue/valid times.',
      'Do not claim NWS authorship for marketplace analysis, imply NOAA/NWS endorsement, or alter official forecast text and present it as an official NWS product.',
      'Exclude station observations because many stations are not maintained by NWS and may contain third-party data.',
      'Check the source response and its metadata for third-party content before each release.',
    ],
  },
  'usaspending.gov': {
    status: 'internal_research_only',
    termsUrl: '',
    reason: 'Public award records may be researched, but this project has not completed a source-specific redistribution and commercial resale review for the exact fields and any third-party material.',
    operationalNotes: ['Keep records internal; do not publish or sell derived record bundles until counsel/source review approves the exact use.'],
  },
  'sam.gov_opportunities': {
    status: 'internal_research_only',
    termsUrl: 'https://sam.gov/about/terms-of-use',
    reason: 'Use only the documented public API with an appropriately authorized API key. SAM.gov prohibits automated website scraping and restricts sensitive data; no commercial redistribution permission has been documented for this product.',
    operationalNotes: ['Never scrape SAM.gov webpages or use FOUO/sensitive data.', 'Do not treat contracting-officer points of contact as marketing leads.', 'Do not mix SAM entity/D&B-derived data into resale products.'],
  },
  'grants.gov_opportunities': {
    status: 'internal_research_only',
    termsUrl: 'https://www.grants.gov/api/terms-conditions',
    reason: 'The API terms permit searching, displaying, analyzing, and retrieving grant information, require a prominent non-endorsement notice, and prohibit false representation. Resale rights for packaged datasets have not been separately established.',
    attributionRequired: true,
    operationalNotes: ['Display the Grants.gov non-endorsement notice when using its API.', 'Do not imply HHS/Grants.gov endorsement.'],
  },
  'public_web_scrape': {
    status: 'blocked',
    termsUrl: '',
    reason: 'A generic public webpage fetch does not establish permission to copy, retain, aggregate, or resell the page contents. Review each website terms, robots guidance, copyright, privacy, and access restrictions before use.',
  },
  'federal_r_and_d': {
    status: 'blocked',
    termsUrl: '',
    reason: 'Commercial resale permission has not been confirmed in writing. Keep private and out of listings, auctions, and checkout.',
  },
});

export function isCommercialReuseApproved(source: string): boolean {
  return SOURCE_RIGHTS_POLICY[source]?.status === 'commercial_reuse_approved';
}


/**
 * Validate the exact NWS forecast record shape approved for commercial reuse.
 * This intentionally excludes station observations, imagery, and third-party content.
 */
export function isApprovedNwsForecastRecord(record: { sourceUrl: string; payload: unknown }): boolean {
  try {
    const url = new URL(record.sourceUrl);
    const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload as Record<string, unknown>
      : {};
    const hasValue = (value: unknown) => value !== null && value !== undefined && String(value).trim().length > 0;
    return url.protocol === 'https:' &&
      url.hostname === 'api.weather.gov' &&
      /^\/gridpoints\/[A-Z0-9]+\/\d+,\d+\/forecast$/i.test(url.pathname) &&
      payload.sourceTermsUrl === 'https://www.weather.gov/disclaimer' &&
      hasValue(payload.location) &&
      hasValue(payload.title) &&
      hasValue(payload.startTime) &&
      hasValue(payload.endTime) &&
      hasValue(payload.forecastUpdatedAt);
  } catch {
    return false;
  }
}

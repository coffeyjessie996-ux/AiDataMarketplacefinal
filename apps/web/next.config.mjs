import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // On Vercel, vercel.json routes /api to the api service before Next sees it.
  // Locally (without `vercel dev`), proxy /api to the Express server instead.
  async rewrites() {
    if (process.env.VERCEL) return [];
    const apiOrigin = process.env.API_ORIGIN || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});

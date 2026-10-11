import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

dotenv.config();

// Must be imported before express so Sentry can auto-instrument it.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  sendDefaultPii: false,
});

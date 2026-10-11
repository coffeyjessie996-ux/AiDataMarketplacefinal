'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, sans-serif',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>
          {"The error has been reported automatically. You can try again."}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

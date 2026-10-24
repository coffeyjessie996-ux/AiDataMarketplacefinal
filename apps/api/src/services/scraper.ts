import { isIP } from 'node:net';

export type ScrapedRecord = Record<string, unknown>;

const MAX_URLS_PER_REQUEST = 20;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;

function isPrivateOrLocalAddress(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  if (ipVersion === 6) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb') ||
      host.startsWith('::ffff:127.') ||
      host.startsWith('::ffff:10.') ||
      host.startsWith('::ffff:192.168.')
    );
  }

  return false;
}

function validatePublicHttpUrl(rawUrl: string): URL {
  if (rawUrl.length > 2048) throw new Error('URL is too long.');

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not allowed.');
  }
  if (isPrivateOrLocalAddress(parsed.hostname)) {
    throw new Error('Local and private network addresses cannot be scraped.');
  }

  return parsed;
}

function decodeBasicEntities(value: string): string {
  // Decode entities in a single pass so &amp;lt; cannot become a new
  // entity delimiter and then be decoded a second time.
  return value.replace(/&(?:nbsp|amp|quot|lt|gt);|&#39;|&apos;/gi, (entity) => {
    switch (entity.toLowerCase()) {
      case '&nbsp;':
        return ' ';
      case '&amp;':
        return '&';
      case '&quot;':
        return '"';
      case '&#39;':
      case '&apos;':
        return "'";
      case '&lt;':
        return '‹';
      case '&gt;':
        return '›';
      default:
        return entity;
    }
  });
}

async function readLimitedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Page is larger than the 2 MB scraping limit.');
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Page is larger than the 2 MB scraping limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

/**
 * Fetches small public webpage snippets for research. This does not bypass
 * logins, CAPTCHAs, paywalls, or site access restrictions, and does not create
 * or sell a dataset on its own.
 */
export async function scrapeSources(inputUrls: string[]) {
  const urls = inputUrls.slice(0, MAX_URLS_PER_REQUEST);
  const records: ScrapedRecord[] = [];

  for (const rawUrl of urls) {
    try {
      const url = validatePublicHttpUrl(rawUrl);
      const response = await fetch(url, {
        headers: {
          'user-agent': 'AI-Data-Marketplace/1.0 (+public business research)',
          accept: 'text/html,application/xhtml+xml;q=0.9',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html') &&
          !contentType.toLowerCase().includes('application/xhtml+xml')) {
        throw new Error('URL did not return an HTML page.');
      }

      const html = await readLimitedText(response);
      const title = decodeBasicEntities(
        html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '',
      ).replace(/<[^>]+>/g, ' ');

      const text = decodeBasicEntities(
        html
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/<script\b[\s\S]*?<\/script(?:\s+[^>]*)?\s*>/gi, ' ')
          .replace(/<style\b[\s\S]*?<\/style(?:\s+[^>]*)?\s*>/gi, ' ')
          .replace(/<noscript\b[\s\S]*?<\/noscript(?:\s+[^>]*)?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );

      records.push({
        sourceUrl: url.toString(),
        title: title.trim().slice(0, 300),
        textSnippet: text.slice(0, 1000),
        status: response.status,
        contentType,
        fetchedAt: new Date().toISOString(),
        extractionMethod: 'public_html_text_snippet',
      });
    } catch (error) {
      records.push({
        sourceUrl: rawUrl.slice(0, 2048),
        error: error instanceof Error ? error.message : 'Unknown scraping error',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return records;
}

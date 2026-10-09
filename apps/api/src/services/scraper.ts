export type ScrapedRecord = Record<string, unknown>;

export async function scrapeSources(urls: string[]) {
  const records: ScrapedRecord[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'AI-Data-Marketplace/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      records.push({ url, title, textSnippet: text.slice(0, 1000), status: response.status });
    } catch (error) {
      records.push({ url, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return records;
}

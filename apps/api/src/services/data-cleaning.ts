import { createHash } from 'node:crypto';

export type DataSource = {
  url: string;
  title: string;
  description: string;
  sourceType: 'web' | 'api' | 'rss';
};

export function computeSourceSignature(source: DataSource) {
  return createHash('sha256')
    .update(`${source.url}|${source.title}|${source.description}`)
    .digest('hex');
}

export function qualityScore(rawRecords: Array<Record<string, unknown>>) {
  if (rawRecords.length === 0) return 0;

  const completeness = rawRecords.filter((record) => Object.keys(record).length > 0).length / rawRecords.length;
  const normalized = Math.round((completeness * 100) * 0.8 + 20);
  return Math.min(100, Math.max(0, normalized));
}

export function cleanSourceRecords(records: Array<Record<string, unknown>>) {
  return records
    .map((record) => {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        const trimmed = typeof value === 'string' ? value.trim() : value;
        if (trimmed !== '' && trimmed !== null && trimmed !== undefined) {
          cleaned[key] = trimmed;
        }
      }
      return cleaned;
    })
    .filter((record) => Object.keys(record).length > 0);
}

/**
 * HTTP client helpers for the marketing daily dataset.
 *
 * Default source is the bundled static JSON at `/data/marketing_daily.json`.
 * Override with `VITE_MARKETING_API_URL` for a remote paginated API
 * (`?page=1&limit=500`). Remote endpoints that return HTML instead of JSON
 * are rejected with a clear error.
 */

export const DEFAULT_MARKETING_API_URL = '/data/marketing_daily.json';

export function getMarketingApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_MARKETING_API_URL?.trim();
  return fromEnv || DEFAULT_MARKETING_API_URL;
}

export function isStaticMarketingJsonUrl(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.json') || path.startsWith('/data/');
}

export class MarketingApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string,
  ) {
    super(message);
    this.name = 'MarketingApiError';
  }
}

export type MarketingApiPagePayload = {
  rows: unknown[];
  pagination?: {
    total_pages?: number;
    total_records?: number;
    page_size?: number;
    page?: number;
  };
};

function extractRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const data = obj.data ?? obj.results ?? obj.records;
    if (Array.isArray(data)) return data;
  }
  return [];
}

function extractPagination(json: unknown): MarketingApiPagePayload['pagination'] {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const pagination = (json as Record<string, unknown>).pagination;
  if (!pagination || typeof pagination !== 'object') return undefined;
  return pagination as MarketingApiPagePayload['pagination'];
}

/**
 * Reads and validates a paginated marketing API response.
 * Rejects HTML/error pages that return HTTP 200 with `text/html`.
 */
export async function fetchMarketingApiPage(
  page: number,
  limit: number,
  baseUrl = getMarketingApiBaseUrl(),
): Promise<MarketingApiPagePayload> {
  const staticJson = isStaticMarketingJsonUrl(baseUrl);
  const url = staticJson ? baseUrl : `${baseUrl}?page=${page}&limit=${limit}`;

  if (staticJson && page > 1) {
    return { rows: [], pagination: { total_pages: 1, page, page_size: limit } };
  }

  let res: Response;

  try {
    res = await fetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MarketingApiError(`Network error fetching marketing data: ${msg}`, undefined, url);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const bodyText = await res.text();

  if (!res.ok) {
    throw new MarketingApiError(
      `Marketing API HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 120)}` : ''}`,
      res.status,
      url,
    );
  }

  const trimmed = bodyText.trim();
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    contentType.includes('text/html')
  ) {
    throw new MarketingApiError(
      'Marketing API returned HTML instead of JSON — the endpoint may be misconfigured or the API may have moved. Set VITE_MARKETING_API_URL to a working JSON endpoint.',
      res.status,
      url,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new MarketingApiError(
      `Marketing API returned invalid JSON (first bytes: ${trimmed.slice(0, 80)}…)`,
      res.status,
      url,
    );
  }

  const rows = extractRows(json);
  if (page === 1 && rows.length === 0) {
    throw new MarketingApiError('Marketing API returned an empty first page.', res.status, url);
  }

  if (staticJson && Array.isArray(json)) {
    return {
      rows,
      pagination: {
        total_pages: 1,
        total_records: rows.length,
        page_size: rows.length,
        page: 1,
      },
    };
  }

  return {
    rows,
    pagination: extractPagination(json),
  };
}

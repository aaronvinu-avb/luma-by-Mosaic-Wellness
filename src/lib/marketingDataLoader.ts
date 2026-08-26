import type { QueryClient, UseQueryOptions } from '@tanstack/react-query';
import { MarketingRecord, generateMockData } from '@/lib/mockData';
import { getCache, setCache } from '@/lib/storage';
import { lumaLog } from '@/lib/logger';
import {
  fetchMarketingApiPage,
  MarketingApiError,
  getMarketingApiBaseUrl,
} from '@/lib/marketingApi';
import { parseLocalDate } from '@/lib/dataBoundaries';

const PAGINATION_LIMIT = 500;
const CONCURRENCY_LIMIT = 6;
const CACHE_KEY = 'marketing_data_v2';
const CACHE_TTL = 1000 * 3600 * 24; // 24 hours

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Reconcile day-of-week and derived metrics from base fields. */
function repairMarketingRecord(record: MarketingRecord): MarketingRecord {
  const spend = record.spend;
  const revenue = record.revenue;
  const impressions = record.impressions;
  const clicks = record.clicks;
  const conversions = record.conversions;

  return {
    ...record,
    day_of_week: DOW_LABELS[parseLocalDate(record.date).getDay()],
    roas: spend > 0 ? round2(revenue / spend) : 0,
    ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? round2(spend / clicks) : 0,
    cpa: conversions > 0 ? round2(spend / conversions) : 0,
    aov: conversions > 0 ? round2(revenue / conversions) : 0,
  };
}

export const MARKETING_DATA_QUERY_KEY = ['marketing-data'] as const;

type DataSource = 'api' | 'mock' | 'loading' | 'cached';

export type MarketingDatasetLoadResult = {
  records: MarketingRecord[];
  source: DataSource;
  droppedDuringNormalization: number;
  /** API multi-page fetch: first page returned immediately, remainder loads in background. */
  loadState?: 'partial' | 'complete';
  /** Set when live API failed and demo data was used instead. */
  fetchError?: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeRecord(input: unknown): MarketingRecord | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.date !== 'string' || typeof raw.channel !== 'string' || typeof raw.day_of_week !== 'string') {
    return null;
  }

  return repairMarketingRecord({
    date: raw.date,
    day_of_week: raw.day_of_week,
    channel: raw.channel,
    spend: toNumber(raw.spend),
    revenue: toNumber(raw.revenue),
    roas: toNumber(raw.roas),
    impressions: toNumber(raw.impressions),
    clicks: toNumber(raw.clicks),
    conversions: toNumber(raw.conversions),
    new_customers: toNumber(raw.new_customers),
    ctr: toNumber(raw.ctr),
    cpc: toNumber(raw.cpc),
    cpa: toNumber(raw.cpa),
    aov: toNumber(raw.aov),
  });
}

function normalizeRecords(records: unknown[]): { records: MarketingRecord[]; dropped: number } {
  let dropped = 0;
  const out: MarketingRecord[] = [];
  for (const raw of records) {
    const r = normalizeRecord(raw);
    if (r) out.push(r); else dropped += 1;
  }
  return { records: out, dropped };
}

function formatFetchError(err: unknown): string {
  if (err instanceof MarketingApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function fetchInChunks(totalPages: number): Promise<unknown[]> {
  const results: unknown[][] = [];
  const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const baseUrl = getMarketingApiBaseUrl();

  for (let i = 0; i < pages.length; i += CONCURRENCY_LIMIT) {
    const chunk = pages.slice(i, i + CONCURRENCY_LIMIT);
    const chunkResults = await Promise.all(
      chunk.map(async (page) => {
        const payload = await fetchMarketingApiPage(page, PAGINATION_LIMIT, baseUrl);
        return payload.rows;
      }),
    );
    results.push(...chunkResults);
  }

  return results.flat();
}

function scheduleRemainingPages(
  queryClient: QueryClient,
  totalPages: number,
  firstRecords: MarketingRecord[],
  firstDropped: number,
) {
  if (totalPages <= 1) return;

  void (async () => {
    const start = performance.now();
    try {
      const restRaw = await fetchInChunks(totalPages);
      const { records: restRecords, dropped: restDropped } = normalizeRecords(restRaw);
      const merged = firstRecords.concat(restRecords);
      const dropped = firstDropped + restDropped;

      queryClient.setQueryData(MARKETING_DATA_QUERY_KEY, (prev: MarketingDatasetLoadResult | undefined) => {
        if (!prev || prev.source !== 'api') return prev;
        if (merged.length < prev.records.length) return prev;
        return {
          records: merged,
          source: 'api',
          droppedDuringNormalization: dropped,
          loadState: 'complete',
          fetchError: null,
        };
      });

      setCache(CACHE_KEY, merged).catch(err => lumaLog.error('Cache save failed:', err));

      lumaLog.info(
        `[Luma] Background hydration: merged ${merged.length} records across ${totalPages} page(s) in ${((performance.now() - start) / 1000).toFixed(2)}s`,
      );
    } catch (err) {
      lumaLog.warn('[Luma] Background pagination failed — keeping first-page slice:', err);
      queryClient.setQueryData(MARKETING_DATA_QUERY_KEY, (prev: MarketingDatasetLoadResult | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          loadState: 'complete',
          fetchError: formatFetchError(err),
        };
      });
    }
  })();
}

async function fetchAllPagesBlocking(): Promise<{ records: MarketingRecord[]; dropped: number }> {
  const start = performance.now();
  const baseUrl = getMarketingApiBaseUrl();

  const first = await fetchMarketingApiPage(1, PAGINATION_LIMIT, baseUrl);
  const totalPages = first.pagination?.total_pages ?? 1;

  let allRaw: unknown[] = [...first.rows];
  if (totalPages > 1) {
    const restRaw = await fetchInChunks(totalPages);
    allRaw = allRaw.concat(restRaw);
  }

  const normalized = normalizeRecords(allRaw);
  const meta = first.pagination;
  lumaLog.info(
    `[Luma] Fetched ${normalized.records.length} records across ${totalPages} page(s) in ${((performance.now() - start) / 1000).toFixed(2)}s` +
      (meta ? ` (API total_records=${meta.total_records ?? 'n/a'}, page_size=${meta.page_size ?? PAGINATION_LIMIT})` : ''),
  );
  if (meta && typeof meta.total_records === 'number' && meta.total_records !== normalized.records.length) {
    lumaLog.warn(
      `[Luma] Record count mismatch — API advertised ${meta.total_records} total_records but we received ${normalized.records.length}. Pagination may be incomplete.`,
    );
  }

  return normalized;
}

function mockFallback(apiError: unknown): MarketingDatasetLoadResult {
  const fetchError = formatFetchError(apiError);
  lumaLog.warn('[Luma] Using demo data — live API unavailable:', fetchError);
  return {
    records: generateMockData(),
    source: 'mock',
    droppedDuringNormalization: 0,
    loadState: 'complete',
    fetchError,
  };
}

/**
 * Single source of truth for marketing rows (API → cache → mock).
 * When the API has multiple pages, **page 1 resolves immediately** and the rest
 * hydrate in the background via `queryClient.setQueryData` (faster TTI).
 */
export async function fetchMarketingDataset(queryClient: QueryClient): Promise<MarketingDatasetLoadResult> {
  const cached = await getCache<MarketingRecord[]>(CACHE_KEY);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    lumaLog.info('[Luma] Loading from IndexedDB Cache');
    const { records, dropped } = normalizeRecords(cached.data);
    return {
      records,
      source: 'cached',
      droppedDuringNormalization: dropped,
      loadState: 'complete',
      fetchError: null,
    };
  }

  try {
    const first = await fetchMarketingApiPage(1, PAGINATION_LIMIT);
    const totalPages = first.pagination?.total_pages ?? 1;
    const { records, dropped } = normalizeRecords(first.rows);

    if (totalPages > 1) {
      lumaLog.info(
        `[Luma] Fast path: showing ${records.length} rows while fetching ${totalPages - 1} more page(s) in background`,
      );
      scheduleRemainingPages(queryClient, totalPages, records, dropped);
      return {
        records,
        source: 'api',
        droppedDuringNormalization: dropped,
        loadState: 'partial',
        fetchError: null,
      };
    }

    lumaLog.info(
      `[Luma] Fetched ${records.length} records (single page)` +
        (first.pagination ? ` (API total_records=${first.pagination.total_records ?? 'n/a'})` : ''),
    );

    setCache(CACHE_KEY, records).catch(err => lumaLog.error('Cache save failed:', err));

    return {
      records,
      source: 'api',
      droppedDuringNormalization: dropped,
      loadState: 'complete',
      fetchError: null,
    };
  } catch (err) {
    lumaLog.warn('[Luma] API fast path failed:', err);
    try {
      const { records, dropped } = await fetchAllPagesBlocking();
      setCache(CACHE_KEY, records).catch(e => lumaLog.error('Cache save failed:', e));
      return {
        records,
        source: 'api',
        droppedDuringNormalization: dropped,
        loadState: 'complete',
        fetchError: null,
      };
    } catch (err2) {
      return mockFallback(err2);
    }
  }
}

export function getMarketingDatasetQueryOptions(
  queryClient: QueryClient,
): UseQueryOptions<MarketingDatasetLoadResult, Error> {
  return {
    queryKey: MARKETING_DATA_QUERY_KEY,
    queryFn: () => fetchMarketingDataset(queryClient),
    staleTime: Infinity,
    retry: false,
  };
}

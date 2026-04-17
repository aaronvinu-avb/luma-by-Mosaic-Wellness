import { useQuery } from '@tanstack/react-query';
import { MarketingRecord, generateMockData } from '@/lib/mockData';
import { getAggregatedState } from '@/lib/calculations';
import { useAppContext } from '@/contexts/AppContext';
import { useMemo } from 'react';
import { getCache, setCache } from '@/lib/storage';

const API_BASE = 'https://mosaicfellowship.in/api/data/marketing/daily';
const PAGINATION_LIMIT = 500;
const CONCURRENCY_LIMIT = 6;
const CACHE_KEY = 'marketing_data_v1';
const CACHE_TTL = 1000 * 3600 * 24; // 24 hours

interface UseMarketingDataOptions {
  includeGlobalAggregate?: boolean;
}

type DataSource = 'api' | 'mock' | 'loading' | 'cached';
type MarketingDataResult = { records: MarketingRecord[]; source: DataSource };

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

  return {
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
  };
}

function normalizeRecords(records: unknown[]): MarketingRecord[] {
  return records.map(normalizeRecord).filter((record): record is MarketingRecord => record !== null);
}

/**
 * Fetches multiple pages in parallel with concurrency control
 */
async function fetchInChunks(totalPages: number): Promise<MarketingRecord[]> {
  const results: MarketingRecord[][] = [];
  const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2); // Pages 2..N

  for (let i = 0; i < pages.length; i += CONCURRENCY_LIMIT) {
    const chunk = pages.slice(i, i + CONCURRENCY_LIMIT);
    const chunkResults = await Promise.all(
      chunk.map(async (page) => {
        const res = await fetch(`${API_BASE}?page=${page}&limit=${PAGINATION_LIMIT}`);
        if (!res.ok) throw new Error(`API error on page ${page}: ${res.status}`);
        const json = await res.json();
        return Array.isArray(json) ? json : json.data ?? json.results ?? [];
      })
    );
    results.push(...chunkResults);
  }

  return results.flat();
}

async function fetchAllPages(): Promise<MarketingRecord[]> {
  const start = performance.now();
  
  // 1. Fetch first page to get metadata
  const res = await fetch(`${API_BASE}?page=1&limit=${PAGINATION_LIMIT}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const firstPageJson = await res.json();
  
  const firstPageRecords: MarketingRecord[] = Array.isArray(firstPageJson) 
    ? firstPageJson 
    : firstPageJson.data ?? firstPageJson.results ?? [];
  
  if (firstPageRecords.length === 0) throw new Error('No data returned');

  const totalPages = firstPageJson.pagination?.total_pages ?? 1;
  const allRecords = [...firstPageRecords];

  // 2. Fetch remaining pages in parallel
  if (totalPages > 1) {
    const remaining = await fetchInChunks(totalPages);
    allRecords.push(...remaining);
  }

  const end = performance.now();
  console.log(`[Luma] Fetched ${allRecords.length} records across ${totalPages} pages in ${((end - start) / 1000).toFixed(2)}s`);
  
  return allRecords;
}

export function useMarketingData(options: UseMarketingDataOptions = {}) {
  const { includeGlobalAggregate = false } = options;
  const query = useQuery<MarketingDataResult>({
    queryKey: ['marketing-data'],
    queryFn: async () => {
      // 1. Try Cache First
      const cached = await getCache<MarketingRecord[]>(CACHE_KEY);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log('[Luma] Loading from IndexedDB Cache');
        return { records: normalizeRecords(cached.data), source: 'cached' };
      }

      // 2. Try API
      try {
        const data = await fetchAllPages();
        const normalized = normalizeRecords(data);
        
        // Save to cache (fire and forget)
        setCache(CACHE_KEY, normalized).catch(err => console.error('Cache save failed:', err));
        
        return { records: normalized, source: 'api' };
      } catch (err) {
        console.warn('API/Cache unavailable, using mock data:', err);
        
        // Final fallback to mock data
        return { records: generateMockData(), source: 'mock' };
      }
    },
    staleTime: Infinity,
    retry: false,
  });


  const { dateFilter } = useAppContext();

  const filteredData = useMemo(() => {
    if (!query.data?.records) return undefined;
    if (dateFilter === 'all') return query.data.records;

    const latestDataDate = query.data.records.reduce((maxDate, record) => (
      record.date > maxDate ? record.date : maxDate
    ), query.data.records[0]?.date ?? '');
    
    // String-based grouping/filtering for performance
    if (dateFilter === 'last30' || dateFilter === 'last90') {
      const days = dateFilter === 'last30' ? 30 : 90;
      const lastDate = new Date(latestDataDate);
      lastDate.setDate(lastDate.getDate() - days);
      const cutoff = toLocalDateString(lastDate);
      return query.data.records.filter(r => r.date >= cutoff);
    }
    
    return query.data.records.filter(r => {
      if (dateFilter === '2023') return r.date.startsWith('2023');
      if (dateFilter === '2024') return r.date.startsWith('2024');
      if (dateFilter === '2025') return r.date.startsWith('2025');
      return true;
    });
  }, [query.data, dateFilter]);

  // globalAggregate is derived from the full unfiltered history (for training/YoY)
  const globalAggregate = useMemo(() => {
    if (!includeGlobalAggregate) return undefined;
    if (!query.data?.records) return undefined;
    return getAggregatedState(query.data.records);
  }, [query.data, includeGlobalAggregate]);

  // aggregate is always derived from the same data the pages see (for UI display)
  const aggregate = useMemo(() => {
    if (!filteredData) return undefined;
    return getAggregatedState(filteredData);
  }, [filteredData]);

  return {
    ...query,
    data: filteredData,
    aggregate,
    globalAggregate,
    dataSource: query.data ? query.data.source : 'loading'
  };
}

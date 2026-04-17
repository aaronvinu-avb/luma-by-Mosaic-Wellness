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

// Track the data source so the UI can display it
let _dataSource: 'api' | 'mock' | 'loading' | 'cached' = 'loading';

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
  console.log(`[Pulse] Fetched ${allRecords.length} records across ${totalPages} pages in ${((end - start) / 1000).toFixed(2)}s`);
  
  return allRecords;
}

export function useMarketingData() {
  const query = useQuery<MarketingRecord[]>({
    queryKey: ['marketing-data'],
    queryFn: async () => {
      // 1. Try Cache First
      const cached = await getCache<MarketingRecord[]>(CACHE_KEY);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log('[Pulse] Loading from IndexedDB Cache');
        _dataSource = 'cached';
        return cached.data;
      }

      // 2. Try API
      try {
        const data = await fetchAllPages();
        _dataSource = 'api';
        
        // Save to cache (fire and forget)
        setCache(CACHE_KEY, data).catch(err => console.error('Cache save failed:', err));
        
        return data;
      } catch (err) {
        console.warn('API/Cache unavailable, using mock data:', err);
        
        // Final fallback to mock data
        _dataSource = 'mock';
        return generateMockData();
      }
    },
    staleTime: Infinity,
    retry: false,
  });


  const { dateFilter } = useAppContext();

  const filteredData = useMemo(() => {
    if (!query.data) return undefined;
    if (dateFilter === 'all') return query.data;

    const nowTime = new Date('2025-12-31').getTime();
    return query.data.filter(r => {
      if (dateFilter === '2023') return r.date.startsWith('2023');
      if (dateFilter === '2024') return r.date.startsWith('2024');
      if (dateFilter === '2025') return r.date.startsWith('2025');

      const rTime = new Date(r.date).getTime();
      const diffDays = (nowTime - rTime) / (1000 * 3600 * 24);

      if (dateFilter === 'last30') return diffDays <= 30;
      if (dateFilter === 'last90') return diffDays <= 90;
      return true;
    });
  }, [query.data, dateFilter]);

  // globalAggregate is derived from the full unfiltered history (for training/YoY)
  const globalAggregate = useMemo(() => {
    if (!query.data) return undefined;
    return getAggregatedState(query.data);
  }, [query.data]);

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
    dataSource: query.data ? _dataSource : 'loading'
  };
}

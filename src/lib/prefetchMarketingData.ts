import type { QueryClient } from '@tanstack/react-query';
import { getMarketingDatasetQueryOptions } from '@/lib/marketingDataLoader';

/** Warm the same cache entry as `useMarketingData` (sidebar hover, landing CTA, etc.). */
export function prefetchMarketingData(client: QueryClient) {
  return client.prefetchQuery(getMarketingDatasetQueryOptions(client));
}

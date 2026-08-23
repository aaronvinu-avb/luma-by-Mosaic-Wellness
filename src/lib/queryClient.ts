import { QueryClient } from '@tanstack/react-query';

/**
 * Shared defaults: dashboards should not refetch on every tab focus unless a query opts in.
 * Per-query options (e.g. marketing `staleTime: Infinity`) still override these.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

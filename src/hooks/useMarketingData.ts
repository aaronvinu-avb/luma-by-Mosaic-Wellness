import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAggregatedState } from '@/lib/calculations';
import { useAppContext } from '@/contexts/AppContext';
import { useMemo, useRef, useEffect } from 'react';
import { auditMarketingData, logDataQualityReport, type DataQualityReport } from '@/lib/dataQuality';
import { computeDataBoundaries, subtractDays, type DataBoundaries } from '@/lib/dataBoundaries';
import {
  getMarketingDatasetQueryOptions,
  MARKETING_DATA_QUERY_KEY,
  type MarketingDatasetLoadResult,
} from '@/lib/marketingDataLoader';

interface UseMarketingDataOptions {
  includeGlobalAggregate?: boolean;
}

export type { MarketingDatasetLoadResult };

export { MARKETING_DATA_QUERY_KEY };

export function useMarketingData(options: UseMarketingDataOptions = {}) {
  const { includeGlobalAggregate = false } = options;
  const queryClient = useQueryClient();
  const query = useQuery({
    ...getMarketingDatasetQueryOptions(queryClient),
  });

  const { dateFilter } = useAppContext();

  const auditReport: DataQualityReport | null = useMemo(() => {
    if (!query.data?.records) return null;
    return auditMarketingData(query.data.records, query.data.droppedDuringNormalization);
  }, [query.data]);

  const lastLoggedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || !auditReport) return;
    const key = `${query.data.source}:${query.data.records.length}:${query.dataUpdatedAt}`;
    if (lastLoggedKeyRef.current === key) return;
    lastLoggedKeyRef.current = key;
    logDataQualityReport(auditReport);
  }, [query.data, auditReport, query.dataUpdatedAt]);

  const boundaries: DataBoundaries | null = useMemo(
    () => computeDataBoundaries(query.data?.records),
    [query.data],
  );

  const filteredData = useMemo(() => {
    if (!query.data?.records) return undefined;
    if (dateFilter === 'all' || !boundaries) return query.data.records;

    if (dateFilter === 'last30' || dateFilter === 'last90') {
      const windowDays = dateFilter === 'last30' ? 30 : 90;
      const cutoff = subtractDays(boundaries.latestDate, windowDays - 1);
      return query.data.records.filter(r => r.date >= cutoff);
    }

    const yearMatch = /^(\d{4})$/.exec(dateFilter);
    if (yearMatch) {
      const year = yearMatch[1];
      if (!boundaries.availableYears.includes(Number(year))) {
        return query.data.records;
      }
      return query.data.records.filter(r => r.date.startsWith(year));
    }

    return query.data.records;
  }, [query.data, dateFilter, boundaries]);

  const globalAggregate = useMemo(() => {
    if (!includeGlobalAggregate) return undefined;
    if (!query.data?.records) return undefined;
    return getAggregatedState(query.data.records);
  }, [query.data, includeGlobalAggregate]);

  const aggregate = useMemo(() => {
    if (!filteredData) return undefined;
    return getAggregatedState(filteredData);
  }, [filteredData]);

  const isDatasetHydrating = query.data?.loadState === 'partial';

  return {
    ...query,
    data: filteredData,
    aggregate,
    globalAggregate,
    dataSource: query.data ? query.data.source : 'loading',
    dataUpdatedAt: query.dataUpdatedAt,
    auditReport,
    boundaries,
    isDatasetHydrating,
  };
}

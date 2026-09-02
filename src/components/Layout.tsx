import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMarketingDatasetQueryOptions } from '@/lib/marketingDataLoader';
import { computeDataBoundaries } from '@/lib/dataBoundaries';

const PAGE_NAMES: Record<string, string> = {
  '/dashboard':  'Overview',
  '/channels':   'Channel Performance',
  '/funnel':     'Traffic Quality Pipeline',
  '/scenarios':  'Scenario Planner',
  '/optimizer':  'Mix Optimiser',
  '/trends':       'Trend Analysis',
  '/financials':   'Financial Insights',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pageName = PAGE_NAMES[location.pathname] || 'Dashboard';
  const queryClient = useQueryClient();
  const { data: boundaries } = useQuery({
    ...getMarketingDatasetQueryOptions(queryClient),
    select: (d) => computeDataBoundaries(d.records),
  });
  const { data: datasetMeta } = useQuery({
    ...getMarketingDatasetQueryOptions(queryClient),
    select: (d) => ({ source: d.source, fetchError: d.fetchError }),
  });

  const rangeLabel = boundaries?.fullRangeLabel ?? 'Jan 2023 – Dec 2025';

  const statusSource = datasetMeta?.source ?? 'loading';
  const statusLabel =
    statusSource === 'mock'
      ? 'Demo data · not the assignment file'
      : statusSource === 'loading'
        ? 'Loading data…'
        : 'Local 3-year file';
  const statusColor =
    statusSource === 'api' || statusSource === 'cached'
      ? '#7FAF7B'
      : statusSource === 'mock'
        ? '#FBBF24'
        : 'var(--text-muted)';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" style={{ backgroundColor: 'var(--bg-root)' }}>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header
            className="app-header h-14 flex items-center justify-between shrink-0 px-8"
            style={{ backgroundColor: 'var(--bg-root)', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="app-header-left flex items-center gap-3">
              <SidebarTrigger className="mr-1" style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {pageName}
              </span>
            </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
              <span
                style={{
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                {rangeLabel}
              </span>
              <div
                className="app-header-status flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: statusColor,
                  padding: '5px 12px',
                  borderRadius: 9999,
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 11,
                  fontWeight: 500,
                }}
                title={datasetMeta?.fetchError ?? undefined}
              >
                <span className="pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: statusColor, display: 'inline-block' }} />
                {statusLabel}
              </div>
              </div>
          </header>
          <main className="app-main flex-1 overflow-auto" style={{ padding: 32 }}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

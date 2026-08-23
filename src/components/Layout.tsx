import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useLocation } from 'react-router-dom';
import { useAppContext, DateFilterType } from '@/contexts/AppContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMarketingDatasetQueryOptions } from '@/lib/marketingDataLoader';
import { computeDataBoundaries } from '@/lib/dataBoundaries';

const PAGE_NAMES: Record<string, string> = {
  // Measurement
  '/dashboard':  'Overview',
  '/channels':   'Channel Performance',
  '/funnel':     'Traffic Quality Pipeline',
  // Strategy
  '/scenarios':  'Scenario Planner',
  '/budget':     'Budget Tracker',
  // Mix Optimiser
  '/optimizer/current-mix': 'Current Mix',
  '/optimizer/diagnosis':   'Diagnosis',
  '/optimizer/recommended': 'Recommended Mix',
  '/optimizer/why':         'Why It Works',
  // Intelligence
  '/trends':       'Trend Analysis',
  '/financials':   'Financial Insights',
  '/daily-digest': 'Daily Digest',
  '/best-days':    'Best Days',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pageName = PAGE_NAMES[location.pathname] || 'Dashboard';
  const { dateFilter, setDateFilter } = useAppContext();
  const queryClient = useQueryClient();
  const { data: boundaries } = useQuery({
    ...getMarketingDatasetQueryOptions(queryClient),
    select: (d) => computeDataBoundaries(d.records),
  });

  const allLabel = boundaries ? boundaries.fullRangeLabel : 'All time';
  const yearOptions = boundaries?.availableYears ?? [];

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
              <select
                className="app-header-filter"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilterType)}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">{allLabel}</option>
                <option value="last30">Last 30 Days</option>
                <option value="last90">Last 90 Days</option>
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>{y} Only</option>
                ))}
              </select>

              <div
                className="app-header-status flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: '#7FAF7B',
                  padding: '5px 12px',
                  borderRadius: 9999,
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                <span className="pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#7FAF7B', display: 'inline-block' }} />
                Live · All channels active
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

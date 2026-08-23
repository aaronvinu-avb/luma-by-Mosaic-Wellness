import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { MiniSparkline } from '@/components/MiniSparkline';
import { ChannelName } from '@/components/ChannelName';
import { getChannelSummaries, getChannelSaturationModels, projectRevenue, getTimeFrameMonths } from '@/lib/calculations';
import { LazySection } from '@/components/LazySection';
import { ChartSkeleton } from '@/components/ChartSkeleton';
import { formatINR, formatINRCompact, formatROAS } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ArrowUpDown } from 'lucide-react';

const ChannelDiminishingReturnsChart = lazy(() => import('@/components/charts/ChannelDiminishingReturnsChart'));
const SpendEfficiencyMatrix = lazy(() =>
  import('@/components/SpendEfficiencyMatrix').then((m) => ({ default: m.SpendEfficiencyMatrix })),
);

type SortKey = 'channel' | 'totalSpend' | 'totalRevenue' | 'roas' | 'cpa';

export default function ChannelPerformance() {
  const { data, aggregate, globalAggregate, isLoading } = useMarketingData({ includeGlobalAggregate: true });
  const [sortKey, setSortKey] = useState<SortKey>('roas');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const summaries = useMemo(() => (aggregate || data) ? getChannelSummaries(aggregate || data!) : [], [data, aggregate]);

  const sorted = useMemo(() => {
    const s = [...summaries];
    s.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return s;
  }, [summaries, sortKey, sortAsc]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage]);

  const models = useMemo(() => (globalAggregate || data) ? getChannelSaturationModels(globalAggregate || data!) : [], [data, globalAggregate]);
  const modelByChannel = useMemo(() => {
    const map: Record<string, (typeof models)[number] | undefined> = {};
    models.forEach((model) => {
      map[model.channel] = model;
    });
    return map;
  }, [models]);
  const summaryByChannel = useMemo(() => {
    const map: Record<string, (typeof summaries)[number] | undefined> = {};
    summaries.forEach((summary) => {
      map[summary.channel] = summary;
    });
    return map;
  }, [summaries]);
  const timeFrameMonths = useMemo(
    () => getTimeFrameMonths(aggregate || globalAggregate || data || []),
    [aggregate, globalAggregate, data]
  );

  const diminishingData = useMemo(() => {
    const multipliers = [0.5, 1, 1.5, 2, 2.5, 3];
    return multipliers.map(mult => {
      const row: Record<string, number | string> = { multiplier: `${mult}x` };
      for (const s of summaries) {
        const model = modelByChannel[s.channel];
        if (model) {
          const spend = (s.totalSpend / timeFrameMonths) * mult; // Use avg monthly spend for the model
          const rev = projectRevenue(model, spend);
          row[s.channel] = spend > 0 ? rev / spend : 0;
        } else {
          row[s.channel] = 0;
        }
      }
      return row;
    });
  }, [summaries, modelByChannel, timeFrameMonths]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  if (isLoading) return <DashboardSkeleton />;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
    setCurrentPage(1);
  };

  const roasBadge = (roas: number) => {
    if (roas > 3) return { bg: 'rgba(52,211,153,0.12)', color: '#34D399' };
    if (roas >= 1) return { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' };
    return { bg: 'rgba(248,113,113,0.12)', color: '#F87171' };
  };

  const cols: { key: SortKey; label: string }[] = [
    { key: 'channel', label: 'Channel' },
    { key: 'totalSpend', label: 'Spend' },
    { key: 'totalRevenue', label: 'Revenue' },
    { key: 'roas', label: 'ROAS' },
    { key: 'cpa', label: 'CPA' },
  ];

  return (
    <div className="mobile-page channel-page space-y-6" style={{ maxWidth: 1280 }}>
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
          Channel Performance
        </h1>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>Spend, revenue, and ROAS breakdown by channel</p>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {cols.map(c => (
                  <th key={c.key} onClick={() => handleSort(c.key)}
                    className="cursor-pointer whitespace-nowrap text-left"
                    style={{ padding: '12px 16px', fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <span className="flex items-center gap-1">{c.label} <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                ))}
                <th style={{ padding: '10px 16px', textAlign: 'right', cursor: 'pointer', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontFamily: 'Outfit', userSelect: 'none' }}>7-Day ROAS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((s, idx) => {
                const badge = roasBadge(s.roas);
                const rowBg = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent';
                return (
                  <tr key={s.channel}
                    className="transition-colors duration-100"
                    style={{ backgroundColor: rowBg, borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-subtle)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = rowBg}
                  >
                    <td style={{ padding: '16px 16px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      <ChannelName channel={s.channel} />
                    </td>
                    <td style={{ padding: '16px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatINRCompact(s.totalSpend)}</td>
                    <td style={{ padding: '16px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatINRCompact(s.totalRevenue)}</td>
                    <td style={{ padding: '16px 16px' }}>
                      <span style={{ backgroundColor: badge.bg, color: badge.color, borderRadius: 9999, padding: '4px 12px', fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        {formatROAS(s.roas)}
                      </span>
                    </td>
                    <td style={{ padding: '16px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.cpa > 0 ? formatINR(Math.round(s.cpa)) : '—'}</td>
                    <td style={{ padding: '16px 16px' }}>
                      {aggregate && aggregate.dailySeries[s.channel] ? (
                        <MiniSparkline 
                          data={aggregate.dailySeries[s.channel].slice(-7).map(d => d.roas)} 
                          color={CHANNEL_COLORS[CHANNELS.indexOf(s.channel)]} 
                          width={100} 
                          height={32} 
                        />
                      ) : (
                        <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', opacity: currentPage === 1 ? 0.5 : 1 }}
            >
              Prev
            </button>
            <span style={{ fontFamily: 'Outfit', fontSize: 12, color: 'var(--text-secondary)' }}>{currentPage}/{totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', opacity: currentPage === totalPages ? 0.5 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <LazySection minHeight={480}>
        <Suspense fallback={<ChartSkeleton height={520} />}>
          <ChannelDiminishingReturnsChart
            diminishingData={diminishingData}
            summaryByChannel={summaryByChannel}
            timeFrameMonths={timeFrameMonths}
          />
        </Suspense>
      </LazySection>

      <LazySection minHeight={460}>
        <Suspense fallback={<ChartSkeleton height={480} />}>
          <SpendEfficiencyMatrix summaries={summaries} />
        </Suspense>
      </LazySection>
    </div>
  );
}

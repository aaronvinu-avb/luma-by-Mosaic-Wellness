import { useMemo, useState } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { DeferredRender } from '@/components/DeferredRender';
import { ChannelName } from '@/components/ChannelName';
import { getChannelSummaries, getMonthlyAggregation, getChannelSaturationModels, getOptimalAllocationNonLinear, projectRevenue, getTimeFrameMonths, getSeasonalityMetrics } from '@/lib/calculations';
import { formatINR, formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS } from '@/lib/mockData';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '@/lib/exportData';
import { Link } from 'react-router-dom';

import { useAppContext } from '@/contexts/AppContext';

const ORBIT_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#2DD4BF', '#E879F9', '#FB923C', '#86EFAC', '#F9A8D4'];

export default function Overview() {
  const { data, aggregate, globalAggregate, isLoading, error, refetch, dataSource } = useMarketingData({ includeGlobalAggregate: true });
  const { dateFilter } = useAppContext();
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const summaries = useMemo(() => (aggregate || data) ? getChannelSummaries(aggregate || data!) : [], [data, aggregate]);
  const monthly = useMemo(() => (aggregate || data) ? getMonthlyAggregation(aggregate || data!) : {}, [data, aggregate]);

  const totals = useMemo(() => {
    const s = summaries.reduce((a, c) => ({
      spend: a.spend + c.totalSpend,
      revenue: a.revenue + c.totalRevenue,
      customers: a.customers + c.newCustomers,
    }), { spend: 0, revenue: 0, customers: 0 });
    return { ...s, roas: s.spend > 0 ? s.revenue / s.spend : 0 };
  }, [summaries]);

  const { yoyGrowth, yoyLabel } = useMemo(() => {
    if (!globalAggregate) return { yoyGrowth: 0, yoyLabel: 'vs prior year' };
    const supportsYearOverYear = dateFilter === 'all' || ['2023', '2024', '2025'].includes(dateFilter);
    if (!supportsYearOverYear) {
      return { yoyGrowth: 0, yoyLabel: 'YoY not shown for rolling windows' };
    }
    
    let currentYear = '2025';
    if (['2023', '2024', '2025'].includes(dateFilter)) {
      currentYear = dateFilter;
    } else {
      const years = Object.keys(globalAggregate.yearlyRevenueMap).map(Number).filter(y => !isNaN(y));
      if (years.length > 0) currentYear = Math.max(...years).toString();
    }
    
    const priorYear = (parseInt(currentYear) - 1).toString();
    const revCurrent = globalAggregate.yearlyRevenueMap[currentYear] || 0;
    const revPrior = globalAggregate.yearlyRevenueMap[priorYear] || 0;
    
    const growth = revPrior > 0 ? ((revCurrent - revPrior) / revPrior) * 100 : 0;
    
    return {
      yoyGrowth: growth,
      yoyLabel: `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% (${currentYear} vs ${priorYear})`
    };
  }, [globalAggregate, dateFilter]);

  const models = useMemo(() => (globalAggregate || aggregate || data) ? getChannelSaturationModels(globalAggregate || aggregate || data!) : [], [data, aggregate, globalAggregate]);

  const timeFrameMonths = useMemo(() => getTimeFrameMonths(aggregate || data || []), [data, aggregate]);

  const avgMonthlySpend = totals.spend / (timeFrameMonths || 1);

  const opportunityGap = useMemo(() => {
    if (models.length === 0 || avgMonthlySpend === 0) return 0;
    
    // Determine if we should apply seasonality (only for short-term filters like last30)
    const activeMonth = new Date().getMonth();
    const seasonality = getSeasonalityMetrics(globalAggregate || data || []);
    const getMultiplier = (ch: string) => {
      if (dateFilter !== 'last30') return 1.0;
      const sea = seasonality.find(s => s.channel === ch);
      return sea?.monthlyIndex?.[activeMonth] ?? 1.0;
    };

    // Apples-to-apples baseline: how much does the model project we get for our CURRENT spend allocation?
    const currentModelRevenue = (summaries || []).reduce((s, chSummary) => {
      const m = (models || []).find(x => x.channel === chSummary.channel);
      const chMonthlySpend = (chSummary.totalSpend || 0) / timeFrameMonths;
      return s + (m ? projectRevenue(m, chMonthlySpend, getMultiplier(chSummary.channel)) : 0);
    }, 0);

    // Optimal allocation projection
    const optFractions = getOptimalAllocationNonLinear(models || [], avgMonthlySpend);
    const optRevenue = CHANNELS.reduce((s, ch) => {
      const m = (models || []).find(x => x.channel === ch);
      return s + (m ? projectRevenue(m, (optFractions[ch] || 0) * avgMonthlySpend, getMultiplier(ch)) : 0);
    }, 0);
    
    return Math.max(0, optRevenue - currentModelRevenue);
  }, [models, avgMonthlySpend, summaries, timeFrameMonths, globalAggregate, data, dateFilter]);

  const sorted = useMemo(() =>
    summaries.map((s, i) => ({ ...s, color: ORBIT_COLORS[i], origIdx: i }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue),
  [summaries]);

  const channelMonthlyRevenue = useMemo(() => {
    const result: Record<string, number[]> = {};
    const months = Object.keys(monthly).sort();
    for (const ch of CHANNELS) {
      result[ch] = months.map(m => monthly[m]?.[ch]?.revenue || 0);
    }
    return result;
  }, [monthly]);

  if (isLoading) return <DashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 14, color: 'var(--text-secondary)' }}>Failed to load data</p>
      <button onClick={() => refetch()} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'Outfit', border: '1px solid var(--border-strong)' }}>Retry</button>
    </div>
  );

  const blendedCAC = totals.customers > 0 ? totals.spend / totals.customers : 0;

  type MetricCard = {
    label: string;
    value: string;
    sub: string;
    subColor: string;
    accent: string;
    size: number;
    valueColor?: string;
  };

  const metrics: MetricCard[] = [
    { label: 'TOTAL REVENUE', value: formatINRCompact(totals.revenue), sub: yoyLabel, subColor: yoyLabel.includes('not shown') ? 'var(--text-muted)' : (yoyGrowth >= 0 ? '#34D399' : '#F87171'), accent: '#34D399', size: 40 },
    { label: 'BLENDED CAC', value: formatINR(blendedCAC), sub: 'acquisition cost per customer', subColor: '#FBBF24', accent: '#FBBF24', size: 36, valueColor: '#FBBF24' },
    { label: 'MONTHLY OPPORTUNITY', value: formatINRCompact(opportunityGap), sub: 'unlocked via AI optimizer', subColor: 'var(--text-muted)', accent: '#34D399', size: 32, valueColor: '#34D399' },
    { label: 'TOTAL SPEND', value: formatINRCompact(totals.spend), sub: 'across 10 channels', subColor: 'var(--text-muted)', accent: '#60A5FA', size: 32 },
    { label: 'OVERALL ROAS', value: `${totals.roas.toFixed(1)}x`, sub: 'return per rupee spent', subColor: 'var(--text-muted)', accent: '#FB923C', size: 32 },
  ];

  return (
    <div className="mobile-page overview-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'visible' }}>
      {/* Header */}
      <div className="overview-title-row" style={{ marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="overview-title" style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.035em', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            Luma Dashboard
            {dataSource !== 'loading' && (
              <span className="overview-source-badge" style={{
                fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                backgroundColor: dataSource === 'api' ? 'rgba(52,211,153,0.12)' : 
                               dataSource === 'cached' ? 'rgba(96,165,250,0.12)' : 
                               'rgba(251,191,36,0.15)',
                color: dataSource === 'api' ? '#34D399' : 
                       dataSource === 'cached' ? '#60A5FA' : 
                       '#FBBF24',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {dataSource === 'api' ? 'LIVE API' : 
                 dataSource === 'cached' ? 'LOCAL CACHE' : 
                 'MOCK DATA'}
              </span>
            )}
          </h1>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.01em', marginTop: 6 }}>Marketing intelligence across 10 channels · Jan 2023 – Dec 2025</p>
        </div>
        <button 
          className="overview-export-btn flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95"
          onClick={() => exportToCSV(summaries.map(s => ({
            Channel: s.channel,
            Spend: s.totalSpend,
            Revenue: s.totalRevenue,
            ROAS: s.totalSpend > 0 ? (s.totalRevenue / s.totalSpend).toFixed(2) : '0.00',
            Customers: s.newCustomers,
            Conversions: s.conversions
          })), 'Luma_Channel_Performance')}
          style={{ 
            backgroundColor: 'var(--bg-card)', 
            border: '1px solid var(--border-strong)', 
            color: 'var(--text-primary)',
            fontFamily: 'Outfit',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer'
          }}
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', marginBottom: 20 }} />

      {/* Main grid */}
      <div className="overview-main-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, flex: 1, minHeight: 0 }}>

        {/* Left KPI panel */}
        <div className="overview-kpi-panel" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', overflow: 'hidden' }}>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)' }}>
            {dateFilter === 'all' ? 'Jan 2023 – Dec 2025' : 
             dateFilter === '2025' ? 'Year 2025' :
             dateFilter === '2024' ? 'Year 2024' :
             dateFilter === '2023' ? 'Year 2023' :
             dateFilter === 'last30' ? 'Last 30 Days' :
             dateFilter === 'last90' ? 'Last 90 Days' : 'Selected Timeframe'}
          </p>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {metrics.map((m, i) => (
              <div key={m.label} className="overview-kpi-item" style={{ padding: '20px 0 20px 12px', borderBottom: i < metrics.length - 1 ? '1px solid var(--border-subtle)' : 'none', borderLeft: `3px solid ${m.accent}` }}>
                <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</p>
                <p className="overview-kpi-value" style={{ fontFamily: 'Outfit', fontSize: m.size, fontWeight: 800, color: m.valueColor || 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>{m.value}</p>
                <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: m.subColor, marginTop: 6 }}>{m.sub}</p>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', marginTop: 'auto' }}>10 active channels</p>
        </div>

        {/* Right: opportunity banner + channel table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <DeferredRender delay={150}>
            {/* Opportunity Alert */}
            {opportunityGap > 0 && (
              <>
              <div className="overview-alert-row" style={{
                background: 'linear-gradient(90deg, var(--alert-bg-1), var(--alert-bg-2))',
                border: '1px solid var(--border-strong)', borderRadius: 12, padding: '14px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#34D399', boxShadow: '0 0 10px #34D399' }} />
                  <p style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Optimization Alert: <span style={{ color: '#34D399' }}>{formatINRCompact(opportunityGap)}</span> monthly revenue uplift identified
                  </p>
                </div>
                <Link to="/optimizer" style={{
                  fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--bg-root)',
                  backgroundColor: '#34D399', padding: '6px 14px', borderRadius: 6,
                  textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Open Optimizer →
                </Link>
              </div>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, margin: '-8px 0 4px 6px' }}>
                <span style={{ fontWeight: 600 }}>Note:</span> Monthly uplift is an estimate. It compares your recent spend pattern against what the algorithm considers the optimal distribution.
              </p>
              </>
            )}

            {/* Channel Table */}
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Table header */}
              <div className="overview-table-head" style={{ backgroundColor: 'var(--border-subtle)', padding: '14px 24px', borderBottom: '1px solid var(--border-strong)', display: 'grid', gridTemplateColumns: '32px 1fr 110px 70px 100px', alignItems: 'center', flexShrink: 0 }}>
                <span />
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CHANNEL</span>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>REVENUE</span>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>ROAS</span>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>TREND</span>
              </div>

              {/* Table rows */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {sorted.map((ch, i) => {
                  const isExpanded = expandedRow === i;
                  const isHovered = hoveredRow === i;
                  const spark = channelMonthlyRevenue[ch.channel]?.map((v, j) => ({ j, v })) || [];

                  return (
                    <div key={ch.channel}>
                      <div
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                        className="overview-table-row"
                        style={{
                          display: 'grid', gridTemplateColumns: '32px 1fr 110px 70px 100px', alignItems: 'center',
                          padding: '14px 24px', borderBottom: i < 9 && !isExpanded ? '1px solid var(--border-subtle)' : 'none',
                          cursor: 'pointer', transition: 'background-color 140ms',
                          backgroundColor: isExpanded || isHovered ? 'var(--border-subtle)' : 'transparent',
                        }}
                      >
                        <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{i + 1}</span>
                        <ChannelName channel={ch.channel} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 500, color: isHovered || isExpanded ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'color 140ms' }} />
                        <span style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', textAlign: 'right' }}>{formatINRCompact(ch.totalRevenue)}</span>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <span style={{ backgroundColor: `${ch.color}1F`, color: ch.color, fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 9999 }}>{ch.roas.toFixed(1)}x</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <div style={{ width: 90, height: 28 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={spark}>
                                <Line type="monotone" dataKey="v" stroke={ch.color} strokeWidth={1.5} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ backgroundColor: 'var(--border-subtle)', borderTop: '1px solid var(--border-strong)', borderBottom: i < 9 ? '1px solid var(--border-subtle)' : 'none', padding: '16px 24px', animation: 'detailSlide 180ms ease' }}>
                          <div className="overview-details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {[
                              { label: 'REVENUE', value: formatINRCompact(ch.totalRevenue), color: 'var(--text-primary)' },
                              { label: 'SPEND', value: formatINRCompact(ch.totalSpend), color: 'var(--text-primary)' },
                              { label: 'ROAS', value: `${ch.roas.toFixed(1)}x`, color: ch.color },
                              { label: 'CONVERSIONS', value: ch.conversions.toLocaleString('en-IN'), color: 'var(--text-primary)' },
                              { label: 'NEW CUSTOMERS', value: ch.newCustomers.toLocaleString('en-IN'), color: 'var(--text-primary)' },
                              { label: 'nCAC', value: `₹${ch.newCustomers > 0 ? Math.round(ch.totalSpend / ch.newCustomers).toLocaleString('en-IN') : '—'}`, color: 'var(--text-primary)' },
                            ].map((m) => (
                              <div key={m.label} style={{ backgroundColor: 'var(--bg-card)', borderRadius: 8, padding: '12px 14px' }}>
                                <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</p>
                                <p style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: m.color, letterSpacing: '-0.02em', marginTop: 4 }}>{m.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </DeferredRender>
        </div>
      </div>

      <style>{`
        @keyframes detailSlide {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 200px; }
        }
      `}</style>
    </div>
  );
}

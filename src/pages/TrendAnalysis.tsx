import { memo, useMemo, useState } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import { getMonthlyAggregation, getSeasonalityMetrics, getDayOfWeekMetrics } from '@/lib/calculations';
import { formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Calendar,
  Sunrise,
  ArrowRightLeft,
  Circle,
  Download,
  Flame
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceArea, BarChart, Bar, Label
} from 'recharts';
import { exportToCSV } from '@/lib/exportData';
import { COMPETITOR_EVENTS } from '@/lib/mockData';
import { LazySection } from '@/components/LazySection';

type Metric = 'roas' | 'revenue' | 'spend';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-root)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

const darkCard = (delay = '0ms') => ({
  className: 'rounded-2xl card-enter',
  style: {
    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)', padding: 24, animationDelay: delay,
    transition: 'transform var(--duration) var(--ease), box-shadow var(--duration) var(--ease), border-color var(--duration) var(--ease)',
  } as React.CSSProperties,
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = '#3A3835'; },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; },
});

const CustomLegend = memo(({ payload }: any) => (
  <div className="flex flex-wrap gap-3 justify-center mt-2">
    {payload?.map((entry: any, i: number) => (
      <ChannelName key={i} channel={entry.value} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }} />
    ))}
  </div>
));

export default function TrendAnalysis() {
  const { data, isLoading } = useMarketingData();
  const [metric, setMetric] = useState<Metric>('roas');
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set([2023, 2024, 2025]));
  const [selectedSeasonChannel, setSelectedSeasonChannel] = useState<string>(CHANNELS[5]); // Email default
  const [showCompetitorOverlay, setShowCompetitorOverlay] = useState(false);
  const [spikePage, setSpikePage] = useState(1);
  const spikePageSize = 8;

  const monthly = useMemo(() => data ? getMonthlyAggregation(data) : {}, [data]);
  const seasonalityMetrics = useMemo(() => data ? getSeasonalityMetrics(data) : [], [data]);
  const dowMetrics = useMemo(() => data ? getDayOfWeekMetrics(data) : [], [data]);

  const chartData = useMemo(() => {
    return Object.entries(monthly)
      .filter(([month]) => selectedYears.has(parseInt(month.slice(0, 4))))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, channels]) => {
        const row: Record<string, string | number> = { month };
        for (const ch of CHANNELS) {
          const c = channels[ch];
          if (!c) { row[ch] = 0; continue; }
          if (metric === 'roas') row[ch] = c.spend > 0 ? parseFloat((c.revenue / c.spend).toFixed(2)) : 0;
          else if (metric === 'revenue') row[ch] = c.revenue;
          else row[ch] = c.spend;
        }
        return row;
      });
  }, [monthly, metric, selectedYears]);

  const bestMonths = useMemo(() => {
    const result: Record<string, { month: string; value: number }> = {};
    for (const ch of CHANNELS) {
      let best = { month: '', value: 0 };
      for (const [month, channels] of Object.entries(monthly)) {
        const rev = channels[ch]?.revenue || 0;
        if (rev > best.value) best = { month, value: rev };
      }
      result[ch] = best;
    }
    return result;
  }, [monthly]);

  const heatmapData = useMemo(() => {
    if (!data) return { grid: {} as Record<string, Record<string, { spend: number; revenue: number; count: number }>>, bestDay: '', worstDay: '', bestDayRoas: 0, worstDayRoas: 0 };
    
    const grid: Record<string, Record<string, { spend: number; revenue: number; count: number }>> = {};
    for (const ch of CHANNELS) {
      grid[ch] = {};
      for (const day of DAYS) {
        grid[ch][day] = { spend: 0, revenue: 0, count: 0 };
      }
    }

    for (const r of data) {
      const d = new Date(r.date);
      const jsDay = d.getDay();
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
      const dayName = DAYS[dayIdx];
      
      const channelGrid = grid[r.channel];
      if (channelGrid && channelGrid[dayName]) {
        channelGrid[dayName].spend += r.spend;
        channelGrid[dayName].revenue += r.revenue;
        channelGrid[dayName].count += 1;
      }
    }

    const dayAvgs: Record<string, { totalRoas: number }> = {};
    for (const day of DAYS) {
      let totalSpend = 0, totalRevenue = 0;
      for (const ch of CHANNELS) {
        const c = grid[ch][day];
        if (c) { totalSpend += c.spend; totalRevenue += c.revenue; }
      }
      dayAvgs[day] = { totalRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0 };
    }

    let bestDay = DAYS[0], worstDay = DAYS[0];
    for (const day of DAYS) {
      if (dayAvgs[day].totalRoas > dayAvgs[bestDay].totalRoas) bestDay = day;
      if (dayAvgs[day].totalRoas < dayAvgs[worstDay].totalRoas) worstDay = day;
    }

    return { grid, bestDay, worstDay, bestDayRoas: dayAvgs[bestDay].totalRoas, worstDayRoas: dayAvgs[worstDay].totalRoas };
  }, [data]);

  const spikeData = useMemo(() => {
    if (!data) return { weeklyChart: [] as any[], periods: [] as any[], spikeMonth: '' };
    const dayMap = new Map<string, number>();
    for (const r of data) dayMap.set(r.date, (dayMap.get(r.date) || 0) + r.revenue);
    const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    const weeks: { week: string; revenue: number }[] = [];
    let i = 0;
    while (i < sorted.length) {
      const weekStart = sorted[i][0];
      let rev = 0;
      const end = Math.min(i + 7, sorted.length);
      for (let j = i; j < end; j++) rev += sorted[j][1];
      weeks.push({ week: weekStart, revenue: rev });
      i = end;
    }
    const periods: { week: string; revenue: number; avg: number; pctDiff: number; type: 'Spike' | 'Dip' }[] = [];
    const chartRows = weeks.map((w, idx) => {
      let avg = 0;
      if (idx >= 4) avg = (weeks[idx - 1].revenue + weeks[idx - 2].revenue + weeks[idx - 3].revenue + weeks[idx - 4].revenue) / 4;
      const row: any = { week: w.week, revenue: w.revenue, avg: idx >= 4 ? avg : null, spike: false, dip: false };
      if (idx >= 4 && avg > 0) {
        const pct = ((w.revenue - avg) / avg) * 100;
        if (w.revenue > avg * 1.3) { row.spike = true; periods.push({ week: w.week, revenue: w.revenue, avg, pctDiff: parseFloat(pct.toFixed(1)), type: 'Spike' }); }
        else if (w.revenue < avg * 0.7) { row.dip = true; periods.push({ week: w.week, revenue: w.revenue, avg, pctDiff: parseFloat(pct.toFixed(1)), type: 'Dip' }); }
      }
      return row;
    });
    const monthCount: Record<string, number> = {};
    for (const p of periods.filter(p => p.type === 'Spike')) { const m = p.week.slice(0, 7); monthCount[m] = (monthCount[m] || 0) + 1; }
    const spikeMonth = Object.entries(monthCount).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
    return { weeklyChart: chartRows, periods, spikeMonth };
  }, [data]);

  const spikeAreas = useMemo(() => {
    const areas: { x1: string; x2: string; type: 'Spike' | 'Dip' }[] = [];
    const chart = spikeData.weeklyChart;
    for (let i = 0; i < chart.length; i++) {
      if (chart[i].spike || chart[i].dip) {
        areas.push({ x1: chart[i].week, x2: chart[i].week, type: chart[i].spike ? 'Spike' : 'Dip' });
      }
    }
    return areas;
  }, [spikeData]);
  const spikePeriodsPage = useMemo(() => {
    const start = (spikePage - 1) * spikePageSize;
    return spikeData.periods.slice(start, start + spikePageSize);
  }, [spikeData.periods, spikePage]);
  const spikeTotalPages = Math.max(1, Math.ceil(spikeData.periods.length / spikePageSize));

  if (isLoading) return <DashboardSkeleton />;

  const toggleYear = (y: number) => {
    const next = new Set(selectedYears);
    if (next.has(y)) { if (next.size > 1) next.delete(y); } else next.add(y);
    setSelectedYears(next);
  };

  const getCellRoas = (ch: string, day: string) => {
    const c = heatmapData.grid[ch]?.[day];
    if (!c || c.spend === 0) return 0;
    return c.revenue / c.spend;
  };
  const allRoasValues = CHANNELS.flatMap(ch => DAYS.map(d => getCellRoas(ch, d))).filter(v => v > 0);
  const minRoas = Math.min(...allRoasValues);
  const maxRoas = Math.max(...allRoasValues);

  const heatColor = (roas: number) => {
    if (maxRoas === minRoas) return 'rgba(52,211,153,0.3)';
    const t = (roas - minRoas) / (maxRoas - minRoas);
    const r = Math.round(251 + t * (52 - 251));
    const g = Math.round(191 + t * (211 - 191));
    const b = Math.round(36 + t * (153 - 36));
    return `rgba(${r},${g},${b},0.2)`;
  };

  const getBestDayForChannel = (ch: string) => {
    let best = '', bestVal = -1;
    for (const d of DAYS) { const v = getCellRoas(ch, d); if (v > bestVal) { bestVal = v; best = d; } }
    return best;
  };

  const pillStyle = (active: boolean) => ({
    fontFamily: 'Plus Jakarta Sans' as const, fontSize: 12, fontWeight: 500 as const,
    padding: '5px 12px', borderRadius: 6, cursor: 'pointer' as const, transition: '150ms',
    backgroundColor: active ? '#222018' : 'var(--border-subtle)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    border: active ? '1px solid var(--border-strong)' : '1px solid #242220',
  });

  return (
    <div className="space-y-6" style={{ maxWidth: 1280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            Trend Analysis
          </h1>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>Performance trends and seasonal patterns over time</p>
        </div>
        <button 
          onClick={() => exportToCSV(chartData.map(row => {
            const cleanRow: any = { Month: row.month };
            CHANNELS.forEach(ch => {
              cleanRow[ch] = row[ch];
            });
            return cleanRow;
          }), `Pulse_Trend_Analysis_${metric}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95"
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
          Export Trends
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>
          {(['roas', 'revenue', 'spend'] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)} style={pillStyle(metric === m)}>
              {m === 'roas' ? 'ROAS' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>
          {[2023, 2024, 2025].map(y => (
            <button key={y} onClick={() => toggleYear(y)} style={pillStyle(selectedYears.has(y))}>
              {y}
            </button>
          ))}
        </div>
        <button 
          onClick={() => setShowCompetitorOverlay(!showCompetitorOverlay)}
          style={{
            ...pillStyle(showCompetitorOverlay),
            backgroundColor: showCompetitorOverlay ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)',
            borderColor: showCompetitorOverlay ? 'rgba(239, 68, 68, 0.5)' : 'var(--border-strong)',
            color: showCompetitorOverlay ? '#EF4444' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <div style={{ 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            backgroundColor: showCompetitorOverlay ? '#EF4444' : '#6B7280',
            boxShadow: showCompetitorOverlay ? '0 0 8px #EF4444' : 'none'
          }} />
          Market Intelligence Overlay
        </button>
      </div>

      <div {...darkCard('70ms')}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          Monthly {metric === 'roas' ? 'ROAS' : metric.charAt(0).toUpperCase() + metric.slice(1)} by Channel
        </h2>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false}
              tickFormatter={metric === 'roas' ? (v: number) => `${v}x` : (v: number) => formatINRCompact(v)} />
            <Tooltip formatter={(v: number) => metric === 'roas' ? `${v.toFixed(2)}x` : formatINRCompact(v)} {...chartTooltipStyle} />
            <Legend content={<CustomLegend />} />
            {showCompetitorOverlay && COMPETITOR_EVENTS.map((event, idx) => (
              <ReferenceArea
                key={idx}
                x1={event.startMonth}
                x2={event.endMonth}
                fill="rgba(239, 68, 68, 0.08)"
                stroke="rgba(239, 68, 68, 0.2)"
                strokeDasharray="3 3"
              >
                <Label 
                  value={event.label} 
                  position="top" 
                  fill="#EF4444" 
                  style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600 }}
                />
              </ReferenceArea>
            ))}
            {CHANNELS.map((ch, i) => (
              <Line key={ch} type="monotone" dataKey={ch} stroke={CHANNEL_COLORS[i]}
                strokeWidth={2} dot={false} name={ch} activeDot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <LazySection minHeight={280}>
      <div {...darkCard('140ms')}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Best Month per Channel</h2>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CHANNELS.map((ch) => (
            <div key={ch} className="flex items-center gap-3 p-3 rounded-xl" style={{ border: '1px solid var(--border-strong)', backgroundColor: 'var(--border-subtle)' }}>
              <ChannelName channel={ch} style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0 }} />
              <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                <Trophy className="h-3 w-3" style={{ color: '#D4A96A' }} />
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{formatINRCompact(bestMonths[ch]?.value || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      </LazySection>

      <LazySection minHeight={420}>
      <div {...darkCard('210ms')}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Day-of-Week Performance</h2>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Channel</th>
                {DAYS.map(d => (
                  <th key={d} style={{ padding: '12px 8px', textAlign: 'center', fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((ch) => {
                const bestDay = getBestDayForChannel(ch);
                return (
                  <tr key={ch} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      <ChannelName channel={ch} />
                    </td>
                    {DAYS.map(d => {
                      const roas = getCellRoas(ch, d);
                      const isBest = d === bestDay;
                      return (
                        <td key={d} style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block', padding: '6px 8px', borderRadius: 6,
                              backgroundColor: roas > 0 ? heatColor(roas) : 'var(--border-subtle)',
                              border: isBest ? '2px solid #E8803A' : '1px solid transparent',
                              fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: isBest ? 700 : 400, color: 'var(--text-secondary)',
                            }}
                          >
                            {roas > 0 ? roas.toFixed(1) : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 14, fontWeight: 500, color: '#34D399' }}>📅 Best overall day: <strong>{heatmapData.bestDay}</strong> — avg ROAS {heatmapData.bestDayRoas.toFixed(1)}x</p>
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 14, fontWeight: 500, color: '#FBBF24' }}>📅 Worst overall day: <strong>{heatmapData.worstDay}</strong> — avg ROAS {heatmapData.worstDayRoas.toFixed(1)}x</p>
          </div>
        </div>
      </div>
      </LazySection>

      <LazySection minHeight={420}>
      <div {...darkCard('280ms')}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={18} style={{ color: '#E8803A' }} />
          Revenue Spike Detector
        </h2>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Weekly revenue vs 4-week rolling average</p>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={spikeData.weeklyChart}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
            <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={60} />
            <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => v != null ? formatINRCompact(v) : '—'} {...chartTooltipStyle} />
            <Legend wrapperStyle={{ color: 'var(--text-secondary)' }} />
            {spikeAreas.map((a, i) => (
              <ReferenceArea key={i} x1={a.x1} x2={a.x2}
                fill={a.type === 'Spike' ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.1)'}
                label={{ value: a.type === 'Spike' ? 'Spike' : 'Dip', fontSize: 10, position: 'top', fill: a.type === 'Spike' ? '#FBBF24' : '#60A5FA' }}
              />
            ))}
            <Line type="monotone" dataKey="revenue" stroke="#FB923C" strokeWidth={2} dot={false} name="Revenue" activeDot={{ r: 3 }} />
            <Line type="monotone" dataKey="avg" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="4-Week Avg" />
          </LineChart>
        </ResponsiveContainer>

        {spikeData.periods.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <h3 style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Detected Periods</h3>
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Week', 'Revenue', '4-Week Avg', '% Diff', 'Type'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spikePeriodsPage.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{p.week}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINRCompact(p.revenue)}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINRCompact(p.avg)}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: p.pctDiff > 0 ? '#34D399' : '#F87171' }}>{p.pctDiff > 0 ? '+' : ''}{p.pctDiff}%</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        backgroundColor: p.type === 'Spike' ? 'rgba(251,191,36,0.12)' : 'rgba(96,165,250,0.12)',
                        color: p.type === 'Spike' ? '#FBBF24' : '#60A5FA',
                        borderRadius: 9999, padding: '3px 10px', fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6
                      }}>
                        {p.type === 'Spike' ? <Flame size={12} /> : <TrendingDown size={12} />}
                        {p.type === 'Spike' ? 'Spike' : 'Dip'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3 px-1">
              <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)' }}>
                Showing {(spikePage - 1) * spikePageSize + 1}-{Math.min(spikePage * spikePageSize, spikeData.periods.length)} of {spikeData.periods.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpikePage((p) => Math.max(1, p - 1))}
                  disabled={spikePage === 1}
                  style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', opacity: spikePage === 1 ? 0.5 : 1 }}
                >
                  Prev
                </button>
                <span style={{ fontFamily: 'Outfit', fontSize: 12, color: 'var(--text-secondary)' }}>{spikePage}/{spikeTotalPages}</span>
                <button
                  onClick={() => setSpikePage((p) => Math.min(spikeTotalPages, p + 1))}
                  disabled={spikePage === spikeTotalPages}
                  style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', opacity: spikePage === spikeTotalPages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </LazySection>

      <LazySection minHeight={480}>
      <div {...darkCard('350ms')}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={18} style={{ color: '#E8803A' }} />
          Seasonality Index — Monthly Performance
        </h2>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-card)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-strong)' }}>Channel</th>
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => (
                  <th key={m} style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-strong)' }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasonalityMetrics.map((sm, ci) => (
                <tr key={sm.channel} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '9px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: '#C8C3BC', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: CHANNEL_COLORS[ci] }} />
                      {sm.channel}
                    </div>
                  </td>
                  {sm.monthlyIndex.map((idx, mi) => {
                    const isPeak = mi === sm.peakMonth;
                    const isTrough = mi === sm.troughMonth;
                    const isHigh = idx > 1;
                    const strength = Math.abs(idx - 1);
                    const bg = isHigh ? `rgba(52,211,153,${Math.min(0.5, strength * 2)})` : `rgba(248,113,113,${Math.min(0.5, strength * 2)})`;
                    return (
                      <td key={mi} style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '5px 7px', borderRadius: 6,
                          backgroundColor: bg,
                          border: isPeak ? '1px solid #34D399' : isTrough ? '1px solid #F87171' : '1px solid transparent',
                          fontFamily: 'Outfit', fontSize: 11, fontWeight: isPeak || isTrough ? 700 : 400,
                          color: isHigh ? '#34D399' : '#F87171', minWidth: 38
                        }}>
                          {idx.toFixed(2)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: '#34D399', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Circle size={8} fill="#34D399" stroke="none" />
            Above avg
          </span>
          <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: '#F87171', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Circle size={8} fill="#F87171" stroke="none" />
            Below avg
          </span>
        </div>
      </div>
      </LazySection>

      <LazySection minHeight={340}>
      <div {...darkCard('420ms')}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: '#E8803A' }} />
            Day-of-Week ROAS Index
          </h2>
          <select
            value={selectedSeasonChannel}
            onChange={e => setSelectedSeasonChannel(e.target.value)}
            style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, backgroundColor: 'var(--border-subtle)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px' }}
          >
            {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '14px 0' }} />
        {(() => {
          const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dow = dowMetrics.find(d => d.channel === selectedSeasonChannel);
          const color = CHANNEL_COLORS[CHANNELS.indexOf(selectedSeasonChannel)];
          if (!dow) return null;
          const barData = dow.dowIndex.map((idx, i) => ({ day: DOW_LABELS[i], index: parseFloat(idx.toFixed(3)) }));
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 24, alignItems: 'start' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} domain={[0.7, 1.3]} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
                  <Bar dataKey="index" fill={color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Best', value: DOW_LABELS[dow.bestDay], color: '#34D399', icon: Trophy },
                  { label: 'Worst', value: DOW_LABELS[dow.worstDay], color: '#F87171', icon: TrendingDown },
                  { label: 'Weekday', value: dow.weekdayAvg.toFixed(2), color: '#60A5FA', icon: Calendar },
                  { label: 'Weekend', value: dow.weekendAvg.toFixed(2), color: '#A78BFA', icon: Sunrise },
                  { 
                    label: 'Bias', 
                    value: (
                      <span className="flex items-center gap-2">
                        {dow.weekendBias === 'weekend' ? 'Weekends' : dow.weekendBias === 'weekday' ? 'Weekdays' : 'Neutral'}
                        <Circle size={8} fill={dow.weekendBias === 'weekend' ? '#34D399' : '#94A3B8'} stroke="none" />
                      </span>
                    ), 
                    color: '#FBBF24', 
                    icon: ArrowRightLeft 
                  },
                ].map(item => (
                  <div key={item.label} style={{ backgroundColor: 'var(--bg-root)', border: '1px solid #242220', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(() => { const Icon = item.icon; return <Icon size={11} style={{ color: item.color }} />; })()}
                      {item.label}
                    </p>
                    <div style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: item.color, marginTop: 4 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
      </LazySection>
    </div>
  );
}

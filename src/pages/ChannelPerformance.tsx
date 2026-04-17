import { useMemo, useState } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { MiniSparkline } from '@/components/MiniSparkline';
import { ChannelName } from '@/components/ChannelName';
import { getChannelSummaries, getDailySparkline, getChannelSaturationModels, projectRevenue, getTimeFrameMonths } from '@/lib/calculations';
import { SpendEfficiencyMatrix } from '@/components/SpendEfficiencyMatrix';
import { formatINR, formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ArrowUpDown, TrendingDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

type SortKey = 'channel' | 'totalSpend' | 'totalRevenue' | 'roas' | 'cpa';

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-root)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

const CustomLegend = ({ payload }: any) => (
  <div className="flex flex-wrap gap-3 justify-center mt-2">
    {payload?.map((entry: any, i: number) => (
      <ChannelName key={i} channel={entry.value} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }} />
    ))}
  </div>
);

export default function ChannelPerformance() {
  const { data, aggregate, globalAggregate, isLoading } = useMarketingData();
  const [sortKey, setSortKey] = useState<SortKey>('roas');
  const [sortAsc, setSortAsc] = useState(false);

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

  const models = useMemo(() => (globalAggregate || data) ? getChannelSaturationModels(globalAggregate || data!) : [], [data, globalAggregate]);

  const diminishingData = useMemo(() => {
    const multipliers = [0.5, 1, 1.5, 2, 2.5, 3];
    const timeFrameMonths = getTimeFrameMonths(aggregate || globalAggregate || data || []);
    return multipliers.map(mult => {
      const row: Record<string, number | string> = { multiplier: `${mult}x` };
      for (const s of summaries) {
        const model = models.find(m => m.channel === s.channel);
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
  }, [summaries, models]);

  if (isLoading) return <DashboardSkeleton />;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
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
    <div className="space-y-6" style={{ maxWidth: 1280 }}>
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
                <th style={{ padding: '12px 16px', fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => {
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
                    <td style={{ padding: '16px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINRCompact(s.totalSpend)}</td>
                    <td style={{ padding: '16px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINRCompact(s.totalRevenue)}</td>
                    <td style={{ padding: '16px 16px' }}>
                      <span style={{ backgroundColor: badge.bg, color: badge.color, borderRadius: 9999, padding: '4px 12px', fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' }}>
                        {s.roas.toFixed(1)}x
                      </span>
                    </td>
                    <td style={{ padding: '16px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINR(Math.round(s.cpa))}</td>
                    <td style={{ padding: '16px 16px' }}>
                      {aggregate && aggregate.dailySeries[s.channel] && (
                        <MiniSparkline 
                          data={aggregate.dailySeries[s.channel].slice(-7).map(d => d.roas)} 
                          color={CHANNEL_COLORS[CHANNELS.indexOf(s.channel)]} 
                          width={100} 
                          height={32} 
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diminishing Returns */}
      <div
        className="rounded-2xl card-enter"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)', padding: 24, transition: 'transform var(--duration) var(--ease), box-shadow var(--duration) var(--ease), border-color var(--duration) var(--ease)' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = 'var(--text-secondary)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      >
        <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingDown size={18} style={{ color: '#F87171' }} />
          Diminishing Returns by Channel
        </h2>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        <ResponsiveContainer width="100%" height={440}>
          <LineChart data={diminishingData}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
            <XAxis dataKey="multiplier" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }}
              axisLine={false} tickLine={false}
              ticks={[0, 4, 8, 12, 16]}
              domain={[0, 16]}
              label={{ value: 'Est. ROAS', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'var(--text-secondary)' } }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const multNum = parseFloat(String(label || '').replace('x', ''));
                return (
                  <div style={{ ...chartTooltipStyle.contentStyle, padding: '12px 16px' } as any}>
                    <p style={{ fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-primary)' }}>Target: {label} Baseline</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {payload.map((entry: any) => {
                        const channel = entry.dataKey;
                        const summary = summaries.find(s => s.channel === channel);
                        const absoluteSpend = (summary?.totalSpend || 0) * multNum;
                        return (
                          <div key={channel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color }} />
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{channel}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>₹{formatINRCompact(absoluteSpend)}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 8 }}>{entry.value.toFixed(2)}x</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }}
            />
            <Legend content={<CustomLegend />} />
            {CHANNELS.map((ch, i) => (
              <Line key={ch} type="monotone" dataKey={ch} stroke={CHANNEL_COLORS[i]}
                strokeWidth={2.5} dot={{ r: 4 }} name={ch} activeDot={{ r: 6 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SpendEfficiencyMatrix summaries={summaries} />
    </div>
  );
}

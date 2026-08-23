import { memo, type CSSProperties } from 'react';
import { TrendingDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ChannelName } from '@/components/ChannelName';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { formatINRCompact } from '@/lib/formatCurrency';
import type { ChannelSummary } from '@/lib/calculations';

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-root)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

type LegendPayloadEntry = { value: string };
type TooltipEntry = { dataKey: string; color: string; value: number };

const CustomLegend = memo(({ payload }: { payload?: LegendPayloadEntry[] }) => (
  <div className="flex flex-wrap gap-3 justify-center mt-2">
    {payload?.map((entry, i: number) => (
      <ChannelName key={i} channel={entry.value} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }} />
    ))}
  </div>
));

export type ChannelDiminishingReturnsChartProps = {
  diminishingData: Record<string, number | string>[];
  summaryByChannel: Record<string, ChannelSummary | undefined>;
  timeFrameMonths: number;
};

/**
 * Heavy Recharts bundle — keep dynamically imported from the Channel Performance page.
 */
export default function ChannelDiminishingReturnsChart({
  diminishingData,
  summaryByChannel,
  timeFrameMonths,
}: ChannelDiminishingReturnsChartProps) {
  return (
    <div
      className="rounded-2xl card-enter"
      style={{
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)', padding: 24,
        transition: 'transform var(--duration) var(--ease), box-shadow var(--duration) var(--ease), border-color var(--duration) var(--ease)',
      }}
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
              return (
                <div style={{ ...chartTooltipStyle.contentStyle, padding: '12px 16px' } as CSSProperties}>
                  <p style={{ fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-primary)' }}>Target: {label} Baseline</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(payload as TooltipEntry[]).map((entry) => {
                      const channel = entry.dataKey;
                      const summary = summaryByChannel[channel];
                      const mult = parseFloat(String(label || '').replace('x', '')) || 1;
                      const absoluteSpend = ((summary?.totalSpend || 0) / timeFrameMonths) * mult;
                      return (
                        <div key={channel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color }} />
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{channel}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatINRCompact(absoluteSpend)}</span>
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
            <Line
              key={ch}
              type="monotone"
              dataKey={ch}
              stroke={CHANNEL_COLORS[i]}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              name={ch}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

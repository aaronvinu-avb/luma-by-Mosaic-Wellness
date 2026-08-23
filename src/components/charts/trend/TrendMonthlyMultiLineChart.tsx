import { memo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceArea, Label,
} from 'recharts';
import { ChannelName } from '@/components/ChannelName';
import { CHANNELS, CHANNEL_COLORS, COMPETITOR_EVENTS } from '@/lib/mockData';
import { formatINRCompact } from '@/lib/formatCurrency';

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

const CustomLegend = memo(({ payload }: { payload?: LegendPayloadEntry[] }) => (
  <div className="flex flex-wrap gap-3 justify-center mt-2">
    {payload?.map((entry, i: number) => (
      <ChannelName key={i} channel={entry.value} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }} />
    ))}
  </div>
));

export type TrendMetric = 'roas' | 'revenue' | 'spend';

export default function TrendMonthlyMultiLineChart({
  chartData,
  metric,
  showCompetitorOverlay,
}: {
  chartData: Record<string, string | number>[];
  metric: TrendMetric;
  showCompetitorOverlay: boolean;
}) {
  return (
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
          <Line
            key={ch}
            type="monotone"
            dataKey={ch}
            stroke={CHANNEL_COLORS[i]}
            strokeWidth={2}
            dot={false}
            name={ch}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

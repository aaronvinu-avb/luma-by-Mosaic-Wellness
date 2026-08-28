import { memo, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ChannelName } from '@/components/ChannelName';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
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

export type TrendMetric = 'roas' | 'revenue' | 'spend';

const PAID_LIKE = CHANNELS.filter(ch => ch !== 'Email' && ch !== 'SMS');
const OWNED = ['Email', 'SMS'] as const;

function formatValue(metric: TrendMetric, v: number): string {
  if (!Number.isFinite(v)) return '—';
  return metric === 'roas' ? `${v.toFixed(2)}x ROAS` : formatINRCompact(v);
}

function xTick(label: string, allLabels: string[]): string {
  const years = new Set(allLabels.map(l => l.slice(-2)));
  if (years.size <= 1) {
    return /^(Jan|Apr|Jul|Oct) /.test(label) ? label.slice(0, 3) : '';
  }
  return label.startsWith('Jan ') ? label : '';
}

const MiniChart = memo(function MiniChart({
  data,
  channel,
  color,
  metric,
}: {
  data: Record<string, string | number>[];
  channel: string;
  color: string;
  metric: TrendMetric;
}) {
  const labels = data.map(d => String(d.label ?? d.month));
  const last = data.length > 0 ? Number(data[data.length - 1]?.[channel] ?? 0) : 0;
  const lastLabel = data.length > 0 ? String(data[data.length - 1]?.label ?? '') : '';
  const xTicks = labels.filter(l => xTick(l, labels) !== '');

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      padding: '10px 12px 4px',
      backgroundColor: 'var(--bg-root)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
        <ChannelName
          channel={channel}
          style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}
        />
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
            {formatValue(metric, last)}
          </div>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)' }}>
            {lastLabel || 'latest month'}
          </div>
        </div>
      </div>
      <div style={{ width: '100%', height: 128 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 2 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
            <XAxis
              dataKey="label"
              ticks={xTicks}
              tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'Outfit' }}
              tickFormatter={(v: string) => xTick(v, labels)}
              axisLine={false}
              tickLine={false}
              height={22}
            />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v: number) => [formatValue(metric, v), metric === 'roas' ? 'ROAS' : metric]}
              labelFormatter={(label: string) => label}
              {...chartTooltipStyle}
            />
            <Line
              type="linear"
              dataKey={channel}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default function TrendMonthlyMultiLineChart({
  chartData,
  metric,
}: {
  chartData: Record<string, string | number>[];
  metric: TrendMetric;
}) {
  const [mode, setMode] = useState<'grid' | 'compare'>('grid');
  const [visible, setVisible] = useState<string[]>(() => [...OWNED, 'Meta Ads', 'Google Search']);
  const [hover, setHover] = useState<string | null>(null);

  const overlayChannels = useMemo(
    () => CHANNELS.filter(ch => visible.includes(ch)),
    [visible],
  );

  const labels = useMemo(() => chartData.map(d => String(d.label ?? d.month)), [chartData]);

  const toggle = (ch: string) => {
    setVisible(prev => {
      if (prev.includes(ch)) {
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== ch);
      }
      return [...prev, ch];
    });
  };

  const pill = (active: boolean) => ({
    fontFamily: 'Outfit' as const,
    fontSize: 11,
    fontWeight: 600 as const,
    padding: '5px 10px',
    borderRadius: 7,
    cursor: 'pointer' as const,
    border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
    backgroundColor: active ? 'var(--bg-card)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => setMode('grid')} style={pill(mode === 'grid')}>One chart each</button>
        <button type="button" onClick={() => setMode('compare')} style={pill(mode === 'compare')}>Compare</button>
        {mode === 'compare' && (
          <>
            <span style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)' }} />
            <button type="button" onClick={() => setVisible([...OWNED])} style={pill(visible.length === 2 && visible.includes('Email'))}>Email + SMS</button>
            <button type="button" onClick={() => setVisible([...PAID_LIKE])} style={pill(visible.length === PAID_LIKE.length)}>Paid-like</button>
            <button type="button" onClick={() => setVisible([...CHANNELS])} style={pill(visible.length === CHANNELS.length)}>All 10</button>
          </>
        )}
      </div>

      {mode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {CHANNELS.map((ch, i) => (
            <MiniChart
              key={ch}
              data={chartData}
              channel={ch}
              color={CHANNEL_COLORS[i]}
              metric={metric}
            />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {CHANNELS.map((ch, i) => {
              const on = visible.includes(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggle(ch)}
                  style={{
                    ...pill(on),
                    opacity: on ? 1 : 0.45,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: CHANNEL_COLORS[i] }} />
                  {ch}
                </button>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart
              data={chartData}
              onMouseLeave={() => setHover(null)}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
              <XAxis
                dataKey="label"
                ticks={labels.filter(l => xTick(l, labels) !== '')}
                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }}
                tickFormatter={(v: string) => xTick(v, labels)}
                axisLine={false}
                tickLine={false}
                height={36}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={metric === 'roas' ? (v: number) => `${v}x` : (v: number) => formatINRCompact(v)}
                label={{
                  value: metric === 'roas' ? 'ROAS' : metric === 'revenue' ? 'Revenue' : 'Spend',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Outfit' },
                }}
              />
              <Tooltip formatter={(v: number, name: string) => [formatValue(metric, v), name]} {...chartTooltipStyle} />
              {overlayChannels.map(ch => {
                const i = CHANNELS.indexOf(ch);
                const dim = hover != null && hover !== ch;
                return (
                  <Line
                    key={ch}
                    type="linear"
                    dataKey={ch}
                    stroke={CHANNEL_COLORS[i]}
                    strokeWidth={hover === ch ? 3 : 2}
                    strokeOpacity={dim ? 0.12 : 1}
                    dot={false}
                    name={ch}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                    onMouseEnter={() => setHover(ch)}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            X-axis is month. Click a channel to show or hide it. Hover a line to isolate it.
          </p>
        </>
      )}
    </div>
  );
}

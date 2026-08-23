import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceArea,
} from 'recharts';
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

export type SpikeRow = { week: string; revenue: number; avg: number | null; spike: boolean; dip: boolean };

export default function TrendSpikeLineChart({
  weeklyChart,
  spikeAreas,
}: {
  weeklyChart: SpikeRow[];
  spikeAreas: { x1: string; x2: string; type: 'Spike' | 'Dip' }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={weeklyChart}>
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
        <Line type="monotone" dataKey="revenue" stroke="#FB923C" strokeWidth={2} dot={false} name="Revenue" activeDot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="avg" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="4-Week Avg" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

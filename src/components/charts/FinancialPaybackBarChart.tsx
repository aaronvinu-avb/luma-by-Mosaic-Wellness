import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { FinancialMetric } from '@/lib/calculations';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, boxShadow: 'var(--shadow-sm)',
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

export default function FinancialPaybackBarChart({ data }: { data: FinancialMetric[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="channel"
          tick={{ fontSize: 11, fill: 'var(--text-primary)', fontFamily: 'Outfit' }}
          width={100}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => [`${v} days`, 'Est. Payback']}
        />
        <Bar dataKey="paybackDays" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.paybackDays < 60 ? '#34D399' : entry.paybackDays < 120 ? '#FBBF24' : '#F87171'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

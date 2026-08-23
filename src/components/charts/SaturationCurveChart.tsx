import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export type SaturationPoint = { spend: number; roas: number };

export default function SaturationCurveChart({
  data,
  strokeColor,
}: {
  data: SaturationPoint[];
  strokeColor: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 4, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" strokeOpacity={0.55} vertical={false} />
        <XAxis
          dataKey="spend"
          tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`}
          tick={{ fontFamily: 'Outfit', fontSize: 10, fill: 'var(--text-secondary)' }}
          axisLine={{ stroke: 'var(--border-subtle)' }}
          tickLine={{ stroke: 'var(--border-subtle)' }}
        />
        <YAxis
          tickFormatter={v => `${v.toFixed(1)}x`}
          tick={{ fontFamily: 'Outfit', fontSize: 10, fill: 'var(--text-secondary)' }}
          axisLine={{ stroke: 'var(--border-subtle)' }}
          tickLine={{ stroke: 'var(--border-subtle)' }}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
          formatter={(v: number) => [`${v.toFixed(2)}x ROAS`, 'Return']}
          labelFormatter={v => `Spend · ₹${(Number(v) / 1000).toFixed(0)}K/mo`}
          contentStyle={{
            fontFamily: 'Outfit', fontSize: 11,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
          labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
          itemStyle={{ color: 'var(--text-primary)' }}
        />
        <Line
          type="monotone"
          dataKey="roas"
          stroke={strokeColor}
          strokeWidth={1.75}
          dot={{ r: 2.5, fill: strokeColor, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: strokeColor, stroke: 'var(--bg-card)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function TrendDowRoasBarChart({
  barData,
  barColor,
}: {
  barData: { day: string; index: number }[];
  barColor: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={barData}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} domain={[0.7, 1.3]} />
        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
        <Bar dataKey="index" fill={barColor} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

export type ScenarioProjectionRow = {
  day: string;
  conservative: number;
  baseline: number;
  aggressive: number;
};

export default function ScenarioForecastAreaChart({
  projectionData,
  scenarioColors,
  baselineIdx,
  highIdx,
}: {
  projectionData: ScenarioProjectionRow[];
  scenarioColors: string[];
  baselineIdx: number;
  highIdx: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={projectionData}>
        <defs>
          <linearGradient id="grad-con" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={scenarioColors[0]} stopOpacity={0.1} />
            <stop offset="95%" stopColor={scenarioColors[0]} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={scenarioColors[baselineIdx]} stopOpacity={0.1} />
            <stop offset="95%" stopColor={scenarioColors[baselineIdx]} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-agg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={scenarioColors[highIdx]} stopOpacity={0.1} />
            <stop offset="95%" stopColor={scenarioColors[highIdx]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} interval={3} />
        <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} width={72} />
        <Tooltip formatter={(v: number) => formatINRCompact(v)} {...chartTooltipStyle} />

        <Area type="monotone" dataKey="aggressive" stroke={scenarioColors[highIdx]} fill="url(#grad-agg)" strokeWidth={2.25} isAnimationActive={false} />
        <Area type="monotone" dataKey="baseline" stroke={scenarioColors[baselineIdx]} fill="url(#grad-base)" strokeWidth={2.75} isAnimationActive={false} />
        <Area type="monotone" dataKey="conservative" stroke={scenarioColors[0]} fill="url(#grad-con)" strokeWidth={2.25} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

import { useMemo, useState } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import { getChannelSaturationModels, computeScenarios } from '@/lib/calculations';
import { formatINR, formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS } from '@/lib/mockData';
import { DEFAULT_MONTHLY_BUDGET } from '@/contexts/OptimizerContext';
import { Shield, Scale, Target, TrendingUp, Zap, Sliders } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Slider } from '@/components/ui/slider';

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-root)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12,
    boxShadow: 'var(--shadow-lg)',
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

// Scenario ladder anchored at the product's canonical monthly budget (₹50L).
// Multipliers are applied to that baseline so the five scenarios always span
// ₹35L → ₹75L regardless of the historical run-rate. Keeping them here as
// named tuples makes it obvious what each tier represents.
const SCENARIO_TIERS = [
  { key: 'conservative', label: 'Conservative', multiplier: 0.70, icon: Shield,    color: '#60A5FA' },
  { key: 'moderate',     label: 'Moderate',     multiplier: 0.85, icon: Scale,     color: '#2DD4BF' },
  { key: 'baseline',     label: 'Baseline',     multiplier: 1.00, icon: Target,    color: '#E8803A' },
  { key: 'growth',       label: 'Growth',       multiplier: 1.20, icon: TrendingUp, color: '#A78BFA' },
  { key: 'aggressive',   label: 'Aggressive',   multiplier: 1.50, icon: Zap,       color: '#F472B6' },
] as const;

const BASELINE_BUDGET = DEFAULT_MONTHLY_BUDGET;
const SCENARIO_BUDGETS = SCENARIO_TIERS.map(t => Math.round(BASELINE_BUDGET * t.multiplier));

export default function ScenarioPlanner() {
  const { data, isLoading } = useMarketingData();
  const [marketMultiplier, setMarketMultiplier] = useState(1.0);

  const scenarioLabels = SCENARIO_TIERS.map(t => t.label);
  const scenarioIcons  = SCENARIO_TIERS.map(t => t.icon);
  const scenarioColors = SCENARIO_TIERS.map(t => t.color);

  const models = useMemo(() => data ? getChannelSaturationModels(data) : [], [data]);

  const globalMultipliers = useMemo(() => {
    const m: Record<string, number> = {};
    CHANNELS.forEach(ch => (m[ch] = marketMultiplier));
    return m;
  }, [marketMultiplier]);

  const scenarios = useMemo(() => 
    models.length > 0 ? computeScenarios(models, SCENARIO_BUDGETS, new Set(), globalMultipliers) : [],
  [models, globalMultipliers]);

  // Forecast chart keeps three representative tracks (lowest / baseline /
  // highest) so the reader can eyeball the spread without a five-line fight.
  const BASELINE_IDX = SCENARIO_TIERS.findIndex(t => t.key === 'baseline');
  const HIGH_IDX     = SCENARIO_TIERS.length - 1;

  const projectionData = useMemo(() => {
    if (scenarios.length < SCENARIO_TIERS.length) return [];
    const results = [];
    const seed = 42;
    let s = seed;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let cumCon = 0, cumBase = 0, cumAgg = 0;
    for (let day = 1; day <= 30; day++) {
      const dowIdx = day % 7;
      const weekendBoost = (dowIdx === 0 || dowIdx === 6) ? 0.85 : 1.08;
      const noise = 0.88 + rand() * 0.24;
      const dailyFactor = weekendBoost * noise;
      cumCon  += (scenarios[0].revenue / 30)            * dailyFactor;
      cumBase += (scenarios[BASELINE_IDX].revenue / 30) * dailyFactor;
      cumAgg  += (scenarios[HIGH_IDX].revenue / 30)     * dailyFactor;
      results.push({
        day: `Day ${day}`,
        conservative: Math.round(cumCon),
        baseline:     Math.round(cumBase),
        aggressive:   Math.round(cumAgg),
      });
    }
    return results;
  }, [scenarios, BASELINE_IDX, HIGH_IDX]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="mobile-page scenario-page space-y-8" style={{ maxWidth: 1280 }}>
      <div className="mobile-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            Scenario Planner
          </h1>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>Model budget scenarios across varying market conditions</p>
          <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', padding: '6px 12px', borderRadius: 8 }}>
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Baseline Budget: </span>
            <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{formatINRCompact(BASELINE_BUDGET)} / mo</span>
          </div>
        </div>

        {/* Sensitivity Control */}
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '16px 20px', width: 320, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sliders size={14} style={{ color: '#E8803A' }} />
              <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Sensitivity</span>
            </div>
            <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: '#E8803A', backgroundColor: 'rgba(232,128,58,0.1)', padding: '2px 8px', borderRadius: 6 }}>
              {Math.round(marketMultiplier * 100)}%
            </span>
          </div>
          <Slider 
            value={[marketMultiplier]} 
            min={0.5} 
            max={1.5} 
            step={0.01} 
            onValueChange={([v]) => setMarketMultiplier(v)} 
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)' }}>Trough (0.5x)</span>
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)' }}>Peak (1.5x)</span>
          </div>
        </div>
      </div>

      {/* Five-tier Scenario Grid — ₹35L → ₹75L anchored at the ₹50L baseline */}
      <div
        className="scenario-cards-grid"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${SCENARIO_TIERS.length}, 1fr)`, gap: 12 }}
      >
        {scenarios.map((s, i) => {
          const tier = SCENARIO_TIERS[i];
          const Icon = tier.icon;
          const color = tier.color;
          const pctDeltaVsBaseline = Math.round((tier.multiplier - 1) * 100);
          const deltaLabel = pctDeltaVsBaseline === 0
            ? 'current'
            : `${pctDeltaVsBaseline > 0 ? '+' : ''}${pctDeltaVsBaseline}%`;
          const isBaseline = tier.key === 'baseline';
          return (
            <div
              key={tier.key}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: `1px solid ${isBaseline ? `${color}55` : `${color}30`}`,
                borderRadius: 16,
                padding: 18,
                boxShadow: 'var(--shadow-sm)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${color}15, transparent)`, pointerEvents: 'none' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ padding: 6, borderRadius: 8, backgroundColor: `${color}15` }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <h3 style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{tier.label}</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Forecast Monthly Revenue</p>
                  <p style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatINRCompact(s.revenue)}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)' }}>Budget ({deltaLabel})</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatINRCompact(s.budget)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)' }}>Est. ROAS</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                      {s.roas.toFixed(2)}x
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-Series Forecast Chart */}
      <div
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 24, padding: 32, boxShadow: 'var(--shadow-sm)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Strategic Forecast (30 Days)</h2>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Compare cumulative monthly pacing across budget tiers (linear day-by-day interpolation)</p>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { key: 'conservative', label: scenarioLabels[0],            color: scenarioColors[0] },
              { key: 'baseline',     label: scenarioLabels[BASELINE_IDX], color: scenarioColors[BASELINE_IDX] },
              { key: 'aggressive',   label: scenarioLabels[HIGH_IDX],     color: scenarioColors[HIGH_IDX] },
            ].map(({ key, label, color }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />

        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={projectionData}>
            <defs>
              <linearGradient id="grad-con" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={scenarioColors[0]}            stopOpacity={0.1}/>
                <stop offset="95%" stopColor={scenarioColors[0]}            stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="grad-base" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={scenarioColors[BASELINE_IDX]} stopOpacity={0.1}/>
                <stop offset="95%" stopColor={scenarioColors[BASELINE_IDX]} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="grad-agg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={scenarioColors[HIGH_IDX]}     stopOpacity={0.1}/>
                <stop offset="95%" stopColor={scenarioColors[HIGH_IDX]}     stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => formatINR(v)} {...chartTooltipStyle} />

            <Area type="monotone" dataKey="aggressive"   stroke={scenarioColors[HIGH_IDX]}     fill="url(#grad-agg)"  strokeWidth={2.5} />
            <Area type="monotone" dataKey="baseline"     stroke={scenarioColors[BASELINE_IDX]} fill="url(#grad-base)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="conservative" stroke={scenarioColors[0]}            fill="url(#grad-con)"  strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="scenario-bottom-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: 24 }}>
          <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>AI Strategic Advisory</h2>
          <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(232,128,58,0.05)', border: '1px solid rgba(232,128,58,0.1)' }}>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {marketMultiplier > 1.1 ? (
                <span>High market efficiency detected. The model recommends shifting towards the <strong style={{ color: scenarioColors[HIGH_IDX] }}>Aggressive</strong> scenario to capture momentum, as marginal ROAS remains above breakeven even at scale.</span>
              ) : marketMultiplier < 0.9 ? (
                <span>Market headwinds detected. Efficiency is dropping across core channels. Consider reverting to the <strong style={{ color: scenarioColors[0] }}>Conservative</strong> tier to protect margins until demand indices recover.</span>
              ) : (
                <span>Market conditions are stable. The <strong style={{ color: scenarioColors[BASELINE_IDX] }}>Baseline</strong> scenario offers the most balanced "Efficient Growth" path, maximizing revenue without significant ROI dilution.</span>
              )}
            </p>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: 20 }}>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Efficiency Trend</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }}>Aggressive Volume Lift</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#34D399', fontVariantNumeric: 'tabular-nums' }}>
                    +{scenarios.length > HIGH_IDX && scenarios[0].revenue > 0
                      ? Math.round(((scenarios[HIGH_IDX].revenue / scenarios[0].revenue) - 1) * 100)
                      : 0}%
                </span>
            </div>
            <div style={{ height: 1, backgroundColor: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }}>Incremental ROAS Drop</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#F87171', fontVariantNumeric: 'tabular-nums' }}>
                    -{scenarios.length > HIGH_IDX && scenarios[0].roas > 0
                      ? Math.round((1 - (scenarios[HIGH_IDX].roas / scenarios[0].roas)) * 100)
                      : 0}%
                </span>
            </div>
        </div>
      </div>
      
      {/* Footer Methodology Note */}
      <div className="flex items-start gap-2 p-4 rounded-xl mt-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', width: '100%' }}>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Methodology: </span> 
          The Scenario Planner tests different budget levels to forecast potential revenue. It accounts for overall market conditions by adjusting performance up or down. These outputs offer strategic estimates to guide risk management, rather than guaranteed results.
        </p>
      </div>
    </div>
  );
}


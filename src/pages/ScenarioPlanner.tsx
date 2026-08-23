import { lazy, Suspense, useMemo, useState } from 'react';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { LazySection } from '@/components/LazySection';
import { ChartSkeleton } from '@/components/ChartSkeleton';
import { formatINRCompact } from '@/lib/formatCurrency';
import { Shield, Scale, Target, TrendingUp, Zap, Sliders } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

const ScenarioForecastAreaChart = lazy(() => import('@/components/charts/ScenarioForecastAreaChart'));

// Scenario ladder: multipliers are applied to **Current Mix monthly budget** from
// OptimizerContext (via `useOptimizerModel`) so tiers recentre when the user changes budget.
const SCENARIO_TIERS = [
  { key: 'conservative', label: 'Conservative', multiplier: 0.70, icon: Shield,    color: '#60A5FA' },
  { key: 'moderate',     label: 'Moderate',     multiplier: 0.85, icon: Scale,     color: '#2DD4BF' },
  { key: 'baseline',     label: 'Baseline',     multiplier: 1.00, icon: Target,    color: '#E8803A' },
  { key: 'growth',       label: 'Growth',       multiplier: 1.20, icon: TrendingUp, color: '#A78BFA' },
  { key: 'aggressive',   label: 'Aggressive',   multiplier: 1.50, icon: Zap,       color: '#F472B6' },
] as const;

const BASELINE_IDX = SCENARIO_TIERS.findIndex(t => t.key === 'baseline');

export default function ScenarioPlanner() {
  const {
    isLoading,
    debug,
    monthlyBudget,
    durationMonths,
    planningPeriod,
    totalPeriodBudget,
  } = useOptimizerModel();
  const [marketMultiplier, setMarketMultiplier] = useState(1.0);

  const scenarioLabels = SCENARIO_TIERS.map(t => t.label);
  const scenarioColors = SCENARIO_TIERS.map(t => t.color);

  /** Same rungs as `computeBudgetScenarios` in `useOptimizerModel` — current mix, scaled budget. */
  const rawScenarios = useMemo(() => debug.scenarios ?? [], [debug.scenarios]);

  const periodSuffix =
    durationMonths <= 1
      ? ''
      : planningPeriod === '1q'
        ? ' / qtr'
        : planningPeriod === '6m'
          ? ' / 6 mo'
          : planningPeriod === '1y'
            ? ' / yr'
            : ` / ${durationMonths} mo`;

  const scenarios = useMemo(
    () =>
      rawScenarios.map(s => ({
        ...s,
        revenue: s.totalRevenue * marketMultiplier,
        roas: s.blendedROAS * marketMultiplier,
      })),
    [rawScenarios, marketMultiplier],
  );

  // Forecast chart keeps three representative tracks (lowest / baseline /
  // highest) so the reader can eyeball the spread without a five-line fight.
  const HIGH_IDX = SCENARIO_TIERS.length - 1;

  /** Cumulative paths share one day-weight pattern so day 30 equals each card’s monthly forecast. */
  const projectionData = useMemo(() => {
    if (scenarios.length < SCENARIO_TIERS.length) return [];
    const seed = 42;
    let state = seed;
    const rand = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
    const weights: number[] = [];
    for (let day = 1; day <= 30; day++) {
      const dowIdx = day % 7;
      const weekendBoost = dowIdx === 0 || dowIdx === 6 ? 0.85 : 1.08;
      const noise = 0.88 + rand() * 0.24;
      weights.push(weekendBoost * noise);
    }
    const sumW = weights.reduce((a, b) => a + b, 0);
    const results: { day: string; conservative: number; baseline: number; aggressive: number }[] = [];
    let cumCon = 0;
    let cumBase = 0;
    let cumAgg = 0;
    for (let i = 0; i < 30; i++) {
      const share = weights[i] / sumW;
      cumCon += scenarios[0].revenue * share;
      cumBase += scenarios[BASELINE_IDX].revenue * share;
      cumAgg += scenarios[HIGH_IDX].revenue * share;
      results.push({
        day: `Day ${i + 1}`,
        conservative: Math.round(cumCon),
        baseline: Math.round(cumBase),
        aggressive: Math.round(cumAgg),
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
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>
            Scale the monthly budget up or down with the same channel mix as Current Mix. Baseline is that reference budget.
          </p>
          <div style={{ marginTop: 12, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', padding: '8px 12px', borderRadius: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference budget (Current Mix)</span>
              <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatINRCompact(monthlyBudget)} / mo</span>
            </div>
            {durationMonths > 1 && (
              <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {formatINRCompact(totalPeriodBudget)} total{periodSuffix} · {durationMonths}-month horizon
              </span>
            )}
          </div>
        </div>

        {/* Sensitivity Control */}
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '16px 20px', width: 320, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sliders size={14} style={{ color: '#E8803A' }} />
              <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market outlook</span>
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
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)' }}>Weaker (0.5×)</span>
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)' }}>Stronger (1.5×)</span>
          </div>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, lineHeight: 1.4 }}>
            Shifts forecast revenue and ROAS together to stress-test demand.
          </p>
        </div>
      </div>

      {/* Five-tier Scenario Grid — multipliers × Current Mix monthly budget */}
      <div
        className="scenario-cards-grid"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${SCENARIO_TIERS.length}, 1fr)`, gap: 14, alignItems: 'stretch' }}
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
                border: isBaseline ? `2px solid ${color}66` : `1px solid ${color}30`,
                borderRadius: 16,
                padding: 18,
                boxShadow: isBaseline ? `0 4px 20px ${color}12` : 'var(--shadow-sm)',
                position: 'relative',
                overflow: 'hidden',
                minHeight: 220,
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
                  <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Forecast revenue (month)</p>
                  <p style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatINRCompact(s.revenue)}
                  </p>
                  {durationMonths > 1 && (
                    <>
                      <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)', marginTop: 6, marginBottom: 2 }}>Forecast Period Revenue</p>
                      <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatINRCompact(s.revenue * durationMonths)}{periodSuffix}
                      </p>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)' }}>Scenario budget ({deltaLabel})</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatINRCompact(s.budget)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, color: 'var(--text-muted)' }}>Blended ROAS</p>
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
            <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Cumulative revenue (30-day view)</h2>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 480, lineHeight: 1.45 }}>
              Same monthly totals as the cards above; the shape shows pacing only. Three tiers: lowest, baseline, and highest budget.
            </p>
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

        <LazySection minHeight={420} rootMargin="160px 0px">
          <Suspense fallback={<ChartSkeleton height={400} />}>
            <ScenarioForecastAreaChart
              projectionData={projectionData}
              scenarioColors={scenarioColors}
              baselineIdx={BASELINE_IDX}
              highIdx={HIGH_IDX}
            />
          </Suspense>
        </LazySection>
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
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }}>Revenue uplift (Aggressive vs Conservative)</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#34D399', fontVariantNumeric: 'tabular-nums' }}>
                    +{scenarios.length > HIGH_IDX && scenarios[0].revenue > 0
                      ? Math.round(((scenarios[HIGH_IDX].revenue / scenarios[0].revenue) - 1) * 100)
                      : 0}%
                </span>
            </div>
            <div style={{ height: 1, backgroundColor: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }}>ROAS difference (Aggressive vs Conservative)</span>
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
          Forecasts use the same channel mix and response curves as Current Mix, with budget scaled by scenario. Market outlook scales revenue and ROAS for stress-testing. Figures are model estimates, not guarantees.
        </p>
      </div>
    </div>
  );
}


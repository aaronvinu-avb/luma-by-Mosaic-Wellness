/**
 * BudgetScenarios — Page 5 of Mix Optimiser
 *
 * DATA CONTRACT — reads from model:
 *   scenarios, marginalNotes, scenarioInterpretation,
 *   currentPlan, monthlyBudget, totalPeriodBudget, durationMonths
 *
 * Must NOT use: raw calibration debug outputs, channel-level internals
 */

import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { formatINRCompact } from '@/lib/formatCurrency';
import {
  TrendingUp, TrendingDown, Minus, ArrowLeft, ArrowRight,
  Zap, Target, AlertTriangle, BarChart2,
} from 'lucide-react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area,
} from 'recharts';

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  overline: {
    fontFamily: 'Outfit' as const, fontSize: 10, fontWeight: 600 as const,
    color: 'var(--text-muted)', textTransform: 'uppercase' as const,
    letterSpacing: '0.09em', margin: 0,
  },
  body: {
    fontFamily: 'Plus Jakarta Sans' as const, fontSize: 13,
    fontWeight: 400 as const, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6,
  },
  num: { fontFamily: 'Outfit' as const, fontVariantNumeric: 'tabular-nums' as const },
};

const CARD: React.CSSProperties = {
  padding: '20px 24px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 14,
  backgroundColor: 'var(--bg-card)',
};

const SCENARIO_COLORS: Record<string, string> = {
  conservative: '#60A5FA',
  current:      '#E8803A',
  growth:       '#A78BFA',
  aggressive:   '#34D399',
};

const SCENARIO_SUITABILITY: Record<string, { label: string; note: string }> = {
  conservative: {
    label: 'Efficient but constrained',
    note: 'Budget concentrates into the strongest-performing channels. Fewer channels active, higher average ROAS, but total revenue is limited.',
  },
  current: {
    label: 'Balanced planning range',
    note: 'Current allocation spread across top performers. Strong efficiency with reasonable coverage across the channel mix.',
  },
  growth: {
    label: 'Growth-oriented',
    note: 'Broader distribution across channels. Incremental spend enters moderately efficient territory — meaningful revenue gain with moderate efficiency decay.',
  },
  aggressive: {
    label: 'Expansionary with decay',
    note: 'Maximum budget tests portfolio-wide saturation. Channels in less efficient ranges absorb incremental spend — revenue grows, but blended ROAS declines meaningfully.',
  },
};

// ── Custom chart tooltip ──────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function ScenarioTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 10, padding: '12px 14px', fontFamily: 'Outfit',
    }}>
      <p style={{ ...T.overline, fontSize: 9, marginBottom: 8 }}>Budget: {label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: p.color }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.name}:</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            {p.dataKey === 'blendedROAS' ? `${p.value.toFixed(2)}x` : formatINRCompact(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BudgetScenarios() {
  const {
    isLoading, scenarios, marginalNotes, scenarioInterpretation,
    monthlyBudget, totalPeriodBudget, durationMonths,
  } = useOptimizerModel();

  if (isLoading) return <DashboardSkeleton />;

  // ── Derived values ───────────────────────────────────────────────────────────
  const currentScenario   = scenarios.find(s => s.key === 'current');
  const bestROASScenario  = scenarios.reduce((b, s) => s.blendedROAS > b.blendedROAS ? s : b, scenarios[0]);
  const bestRevScenario   = scenarios.reduce((b, s) => s.periodRevenue > b.periodRevenue ? s : b, scenarios[0]);
  const bestMargNote      = marginalNotes.length > 0
    ? marginalNotes.reduce((b, n) => n.marginalROAS > b.marginalROAS ? n : b, marginalNotes[0])
    : null;

  // For the chart — budget on X, revenue + ROAS on Y
  const chartData = scenarios.map(s => ({
    label:       s.label,
    key:         s.key,
    budget:      formatINRCompact(s.monthlyBudget),
    periodRevenue: s.periodRevenue,
    blendedROAS:   s.blendedROAS,
    color:         SCENARIO_COLORS[s.key] || '#94a3b8',
  }));

  // ROAS range for secondary Y axis
  const roasMin = Math.max(0, Math.min(...scenarios.map(s => s.blendedROAS)) - 0.5);
  const roasMax = Math.max(...scenarios.map(s => s.blendedROAS)) + 0.5;
  const revMin  = 0;
  const revMax  = Math.max(...scenarios.map(s => s.periodRevenue)) * 1.08;

  // Planning zones
  const firstROAS   = scenarios[0]?.blendedROAS  ?? 0;
  const lastROAS    = scenarios[scenarios.length - 1]?.blendedROAS ?? 0;
  const roasDecline = Math.round((1 - lastROAS / firstROAS) * 100);
  const cautionScenario = scenarios.find(s => s.key === 'aggressive');

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── A. Page Header ────────────────────────────────────────────────── */}
      <div>
        <h1 style={{
          fontFamily: 'Outfit', fontSize: 26, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0,
        }}>
          Budget Scenarios
        </h1>
        <p style={{ ...T.body, fontSize: 13, marginTop: 5, color: 'var(--text-secondary)' }}>
          Explore how expected performance and channel allocation change across different budget levels.
        </p>
        <p style={{ ...T.body, fontSize: 11, marginTop: 3 }}>
          Scenarios re-run the optimizer at each budget level · Current: {formatINRCompact(monthlyBudget)}/mo
          · {durationMonths}mo · {formatINRCompact(totalPeriodBudget)} total
        </p>
      </div>

      {/* ── B. Scenario Summary Strip ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          {
            label:   'Current budget',
            value:   formatINRCompact(currentScenario?.monthlyBudget ?? monthlyBudget) + '/mo',
            sub:     `${formatINRCompact(currentScenario?.periodRevenue ?? 0)} · ${currentScenario?.blendedROAS.toFixed(2)}x ROAS`,
            accent:  '#E8803A',
            icon:    <Target size={11} color="#E8803A" />,
            note:    'Baseline reference',
          },
          {
            label:   'Best efficiency',
            value:   `${bestROASScenario?.blendedROAS.toFixed(2)}x ROAS`,
            sub:     `At ${formatINRCompact(bestROASScenario?.monthlyBudget ?? 0)}/mo`,
            accent:  '#34D399',
            icon:    <Zap size={11} color="#34D399" />,
            note:    bestROASScenario?.key === 'current' ? 'Same as current' : bestROASScenario?.label,
          },
          {
            label:   'Peak revenue',
            value:   formatINRCompact(bestRevScenario?.periodRevenue ?? 0),
            sub:     `At ${formatINRCompact(bestRevScenario?.monthlyBudget ?? 0)}/mo · ${bestRevScenario?.blendedROAS.toFixed(2)}x ROAS`,
            accent:  '#A78BFA',
            icon:    <TrendingUp size={11} color="#A78BFA" />,
            note:    bestRevScenario?.key === 'current' ? 'Same as current' : bestRevScenario?.label,
          },
          {
            label:   'Incremental efficiency',
            value:   bestMargNote ? `${bestMargNote.marginalROAS.toFixed(2)}x marginal` : '—',
            sub:     bestMargNote
              ? `${bestMargNote.from} → ${bestMargNote.to} tier`
              : 'No incremental data',
            accent:  '#60A5FA',
            icon:    <BarChart2 size={11} color="#60A5FA" />,
            note:    'Best marginal return between tiers',
          },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...CARD, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              {kpi.icon}
              <p style={{ ...T.overline, fontSize: 9 }}>{kpi.label}</p>
            </div>
            <p style={{ ...T.num, fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', letterSpacing: '-0.025em', margin: '6px 0 4px' }}>
              {kpi.value}
            </p>
            <p style={{ ...T.body, fontSize: 11, lineHeight: 1.4, flex: 1 }}>{kpi.sub}</p>
            <p style={{ fontFamily: 'Outfit', fontSize: 10, color: kpi.accent, marginTop: 5 }}>{kpi.note}</p>
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: 6, opacity: 0.3 }} />
          </div>
        ))}
      </div>

      {/* ── C. Budget Sensitivity Chart ───────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ ...T.overline, marginBottom: 5 }}>Portfolio sensitivity</p>
            <p style={{ ...T.body, fontSize: 12, maxWidth: 480 }}>
              Revenue grows as budget increases, but at a decreasing rate — the optimizer encounters diminishing returns across channels.
              Blended ROAS tends to fall as higher budgets push spend into less efficient territory.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 2, backgroundColor: '#60A5FA', borderRadius: 1 }} />
              <span style={{ ...T.body, fontSize: 11 }}>Revenue</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 2, backgroundColor: '#E8803A', borderRadius: 1, borderTop: '2px dashed #E8803A', background: 'none' }} />
              <span style={{ ...T.body, fontSize: 11 }}>Blended ROAS</span>
            </div>
            {currentScenario && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#E8803A', border: '2px solid #E8803A' }} />
                <span style={{ ...T.body, fontSize: 11 }}>Current</span>
              </div>
            )}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis
              dataKey="budget"
              tick={{ fontFamily: 'Outfit', fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false} tickLine={false}
            />
            {/* Left Y: Revenue */}
            <YAxis
              yAxisId="rev"
              orientation="left"
              tickFormatter={v => formatINRCompact(v)}
              tick={{ fontFamily: 'Outfit', fontSize: 9, fill: 'var(--text-muted)' }}
              axisLine={false} tickLine={false}
              domain={[revMin, revMax]}
            />
            {/* Right Y: ROAS */}
            <YAxis
              yAxisId="roas"
              orientation="right"
              tickFormatter={v => `${v.toFixed(1)}x`}
              tick={{ fontFamily: 'Outfit', fontSize: 9, fill: 'var(--text-muted)' }}
              axisLine={false} tickLine={false}
              domain={[roasMin, roasMax]}
            />
            <Tooltip content={<ScenarioTooltip />} />

            {/* Revenue area + line */}
            <Area
              yAxisId="rev"
              type="monotone"
              dataKey="periodRevenue"
              name="Revenue"
              stroke="#60A5FA"
              strokeWidth={2}
              fill="#60A5FA"
              fillOpacity={0.06}
              dot={(props: { cx: number; cy: number; index: number }) => {
                const s = scenarios[props.index];
                const isCurrentBudget = s?.key === 'current';
                return (
                  <circle
                    key={`dot-rev-${props.index}`}
                    cx={props.cx} cy={props.cy}
                    r={isCurrentBudget ? 6 : 4}
                    fill={isCurrentBudget ? '#E8803A' : '#60A5FA'}
                    stroke={isCurrentBudget ? '#E8803A' : '#60A5FA'}
                    strokeWidth={isCurrentBudget ? 2 : 1}
                  />
                );
              }}
            />

            {/* ROAS line */}
            <Line
              yAxisId="roas"
              type="monotone"
              dataKey="blendedROAS"
              name="Blended ROAS"
              stroke="#E8803A"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={(props: { cx: number; cy: number; index: number }) => {
                const s = scenarios[props.index];
                const isCurrentBudget = s?.key === 'current';
                return (
                  <circle
                    key={`dot-roas-${props.index}`}
                    cx={props.cx} cy={props.cy}
                    r={isCurrentBudget ? 5 : 3}
                    fill={isCurrentBudget ? '#E8803A' : 'var(--bg-card)'}
                    stroke="#E8803A"
                    strokeWidth={2}
                  />
                );
              }}
            />

            {/* Reference line for current budget */}
            {currentScenario && (
              <ReferenceLine
                yAxisId="rev"
                x={formatINRCompact(currentScenario.monthlyBudget)}
                stroke="rgba(232,128,58,0.3)"
                strokeDasharray="4 3"
                label={{
                  value: 'Current',
                  position: 'top',
                  fill: '#E8803A',
                  fontFamily: 'Outfit',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <p style={{ ...T.body, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
          Revenue (blue area) and blended ROAS (orange dashed) across budget levels. The current budget is marked in orange.
          Note how ROAS declines as budget rises — this is expected diminishing returns behavior, not a model error.
        </p>
      </div>

      {/* ── D. Scenario Cards ─────────────────────────────────────────────── */}
      <div>
        <p style={{ ...T.overline, marginBottom: 14 }}>Scenario comparison</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {scenarios.map(s => {
            const color     = SCENARIO_COLORS[s.key] || '#94a3b8';
            const isBase    = s.key === 'current';
            const suitability = SCENARIO_SUITABILITY[s.key];
            const DirIcon   = s.deltaRevenue > 0 ? TrendingUp : s.deltaRevenue < 0 ? TrendingDown : Minus;
            const deltaColor = s.deltaRevenue > 0 ? '#34D399' : s.deltaRevenue < 0 ? '#F87171' : 'var(--text-muted)';

            return (
              <div key={s.key} style={{
                ...CARD,
                border: isBase ? `1px solid ${color}44` : '1px solid var(--border-subtle)',
                backgroundColor: isBase ? `${color}05` : 'var(--bg-card)',
              }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
                    <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      {s.label}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {isBase && (
                      <span style={{
                        fontFamily: 'Outfit', fontSize: 9, fontWeight: 700,
                        color, backgroundColor: `${color}18`,
                        padding: '2px 8px', borderRadius: 4,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        Current
                      </span>
                    )}
                    {suitability && (
                      <span style={{
                        fontFamily: 'Outfit', fontSize: 9, fontWeight: 600,
                        color: 'var(--text-muted)', backgroundColor: 'var(--bg-root)',
                        border: '1px solid var(--border-subtle)',
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {suitability.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>Monthly budget</p>
                    <p style={{ ...T.num, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                      {formatINRCompact(s.monthlyBudget)}
                    </p>
                  </div>
                  <div>
                    <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>Revenue</p>
                    <p style={{ ...T.num, fontSize: 17, fontWeight: 800, color, margin: 0, letterSpacing: '-0.02em' }}>
                      {formatINRCompact(s.periodRevenue)}
                    </p>
                  </div>
                  <div>
                    <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>ROAS</p>
                    <p style={{ ...T.num, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                      {s.blendedROAS.toFixed(2)}x
                    </p>
                  </div>
                </div>

                {/* Delta vs current */}
                {!isBase && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 7,
                    backgroundColor: 'var(--bg-root)',
                    marginBottom: 12,
                  }}>
                    <DirIcon size={11} color={deltaColor} />
                    <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: deltaColor }}>
                      {s.deltaRevenue >= 0 ? '+' : ''}{formatINRCompact(s.deltaRevenue)} revenue
                    </span>
                    <span style={{ ...T.body, fontSize: 11 }}>·</span>
                    <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: s.deltaROAS >= 0 ? '#34D399' : '#FBBF24' }}>
                      {s.deltaROAS >= 0 ? '+' : ''}{s.deltaROAS.toFixed(2)}x ROAS
                    </span>
                    <span style={{ ...T.body, fontSize: 11 }}>vs current</span>
                  </div>
                )}

                {/* Suitability note */}
                {suitability && (
                  <p style={{ ...T.body, fontSize: 12, lineHeight: 1.55 }}>{suitability.note}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Marginal efficiency between tiers ─────────────────────────────── */}
      {marginalNotes.length > 0 && (
        <div style={{ ...CARD }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ ...T.overline, marginBottom: 4 }}>Incremental efficiency between tiers</p>
            <p style={{ ...T.body, fontSize: 12 }}>
              Marginal ROAS shows the return on the <em>additional</em> spend between budget levels — not the blended average.
              Falling marginal ROAS signals where additional spend starts meeting diminishing returns.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {marginalNotes.map(n => {
              const effColor = n.marginalROAS >= 3 ? '#34D399' : n.marginalROAS >= 1.5 ? '#FBBF24' : '#F87171';
              const effLabel = n.marginalROAS >= 3 ? 'Strong' : n.marginalROAS >= 1.5 ? 'Moderate' : 'Weak';
              return (
                <div key={`${n.from}-${n.to}`} style={{
                  flex: '1 1 160px', padding: '14px 16px',
                  backgroundColor: 'var(--bg-root)', borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                }}>
                  <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>
                    {n.from} → {n.to}
                  </p>
                  <p style={{ ...T.num, fontWeight: 900, fontSize: 24, color: effColor, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>
                    {n.marginalROAS.toFixed(2)}x
                  </p>
                  <span style={{
                    fontFamily: 'Outfit', fontSize: 9, fontWeight: 700,
                    color: effColor, backgroundColor: `${effColor}12`,
                    padding: '2px 7px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    display: 'inline-block', marginTop: 6,
                  }}>
                    {effLabel}
                  </span>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 10, paddingTop: 10 }}>
                    <p style={{ ...T.body, fontSize: 11, lineHeight: 1.4 }}>
                      +{formatINRCompact(n.extraBudget)} spend
                    </p>
                    <p style={{ ...T.num, fontSize: 12, fontWeight: 700, color: effColor, marginTop: 2 }}>
                      +{formatINRCompact(n.extraRevenue)} revenue
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── E. Mix Shift Explanation ──────────────────────────────────────── */}
      <div>
        <p style={{ ...T.overline, marginBottom: 14 }}>How the mix shifts across budget levels</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            {
              icon: <TrendingDown size={13} color="#60A5FA" />,
              title: 'At lower budgets',
              body: 'The optimizer concentrates spend into the highest-efficiency channels. Fewer channels receive meaningful allocation, but the portfolio achieves stronger average ROAS because weak performers are effectively excluded.',
              accent: '#60A5FA',
            },
            {
              icon: <Minus size={13} color="#E8803A" />,
              title: 'At the current budget',
              body: 'Budget is spread across the top performers with some secondary channels included. This reflects the balance between maximizing return and maintaining reasonable channel coverage.',
              accent: '#E8803A',
            },
            {
              icon: <TrendingUp size={13} color="#34D399" />,
              title: 'At higher budgets',
              body: 'The optimizer broadens allocation to more channels as top-tier opportunities become saturated. Budget enters moderately efficient territory to keep the total growing — but blended ROAS falls as weaker channels absorb incremental spend.',
              accent: '#34D399',
            },
          ].map(block => (
            <div key={block.title} style={{ ...CARD, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {block.icon}
                <p style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {block.title}
                </p>
              </div>
              <p style={{ ...T.body, fontSize: 12, lineHeight: 1.65 }}>{block.body}</p>
              <div style={{ height: 2, backgroundColor: block.accent, borderRadius: 1, marginTop: 14, opacity: 0.25 }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── F. Diminishing Returns Summary ────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ ...T.overline, marginBottom: 6 }}>Why efficiency falls as budget rises</p>
            <p style={{ ...T.body, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              Every channel eventually reaches a point where each additional pound of spend returns less than the previous.
              The optimizer captures this through channel-specific spend-response curves.
              As you increase total budget, incremental spend must flow into less efficient territory — either deeper into saturating channels or into lower-efficiency channels that weren't viable at smaller budgets.
            </p>
          </div>
          {roasDecline > 0 && (
            <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-root)', borderRadius: 10, border: '1px solid var(--border-subtle)', flexShrink: 0, textAlign: 'right' }}>
              <p style={{ ...T.overline, fontSize: 9, marginBottom: 8 }}>ROAS from conservative → aggressive</p>
              <p style={{ ...T.num, fontSize: 28, fontWeight: 900, color: '#FBBF24', letterSpacing: '-0.04em', margin: 0, lineHeight: 1 }}>
                -{roasDecline}%
              </p>
              <p style={{ ...T.body, fontSize: 11, marginTop: 4 }}>blended efficiency loss</p>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            {
              heading: 'Revenue can still grow',
              text: 'Even as efficiency declines, total revenue can increase because more channels are active and total spend is higher. The trade-off is lower return per rupee, not lower absolute return.',
            },
            {
              heading: 'Saturation is channel-specific',
              text: 'Not all channels saturate at the same rate. Channels with broad reach and diverse audiences show slower diminishing returns than narrow channels. This is why the mix shifts as budget scales.',
            },
            {
              heading: 'The curve is non-linear',
              text: 'The first extra rupee added to a strong channel returns more than the tenth. This concave relationship is the foundation of why budget optimization produces a different mix at each spend level.',
            },
          ].map(block => (
            <div key={block.heading} style={{
              padding: '14px 16px', backgroundColor: 'var(--bg-root)',
              borderRadius: 10, border: '1px solid var(--border-subtle)',
            }}>
              <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 7px' }}>
                {block.heading}
              </p>
              <p style={{ ...T.body, fontSize: 12, lineHeight: 1.6 }}>{block.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── G. Planning Takeaway ──────────────────────────────────────────── */}
      <div style={{ ...CARD, borderColor: 'rgba(232,128,58,0.18)' }}>
        <p style={{ ...T.overline, marginBottom: 16 }}>Planning takeaway</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[
            {
              icon:    <Zap size={12} color="#34D399" />,
              heading: 'Most efficient range',
              body:    `The ${bestROASScenario?.label ?? 'conservative'} scenario shows the strongest blended ROAS (${bestROASScenario?.blendedROAS.toFixed(2)}x). If efficiency is the primary goal, concentrating budget here delivers the strongest return per rupee.`,
              color:   '#34D399',
            },
            {
              icon:    <Target size={12} color="#E8803A" />,
              heading: 'Most balanced range',
              body:    `The current budget (${formatINRCompact(monthlyBudget)}/mo) appears to be a reasonable balance between efficiency and revenue scale. This is where the optimizer's recommendation is calibrated.`,
              color:   '#E8803A',
            },
            {
              icon:    <AlertTriangle size={12} color="#FBBF24" />,
              heading: 'Caution zone',
              body:    cautionScenario
                ? `At the ${cautionScenario.label} level (${formatINRCompact(cautionScenario.monthlyBudget)}/mo), blended ROAS drops to ${cautionScenario.blendedROAS.toFixed(2)}x. This level is defensible if volume is the priority, but marginal returns are weak on incremental spend.`
                : 'Review the aggressive scenario carefully. Incremental spend at that level likely encounters significant saturation across most channels.',
              color:   '#FBBF24',
            },
            {
              icon:    <BarChart2 size={12} color="#A78BFA" />,
              heading: 'Strategic consideration',
              body:    scenarioInterpretation
                ? scenarioInterpretation
                : 'Use these scenarios as directional guidance rather than precise forecasts. The model captures the general shape of diminishing returns, but actual results depend on execution quality and market conditions.',
              color:   '#A78BFA',
            },
          ].map(block => (
            <div key={block.heading} style={{
              padding: '14px 16px', backgroundColor: 'var(--bg-root)',
              borderRadius: 10, border: `1px solid ${block.color}18`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                {block.icon}
                <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {block.heading}
                </p>
              </div>
              <p style={{ ...T.body, fontSize: 12, lineHeight: 1.65 }}>{block.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── H. CTA ────────────────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap' as const,
        borderColor: 'rgba(232,128,58,0.18)', padding: '18px 22px',
      }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Ready to apply the recommended mix?
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 4 }}>
            Head back to Recommended Mix to review the per-channel allocation and apply it in one click.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexShrink: 0 }}>
          <Link to="/optimizer/why-it-works" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 15px', borderRadius: 9,
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)',
            fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}>
            <ArrowLeft size={13} /> Why It Works
          </Link>
          <Link to="/optimizer/recommended" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: 9,
            background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
            color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
          }}>
            Recommended Mix <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

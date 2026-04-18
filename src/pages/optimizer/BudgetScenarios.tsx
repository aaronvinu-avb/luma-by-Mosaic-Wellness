/**
 * BudgetScenarios — Page 5 of Mix Optimiser
 *
 * DATA CONTRACT — reads from model:
 *   scenarios, marginalNotes, scenarioInterpretation, currentPlan,
 *   monthlyBudget, totalPeriodBudget, durationMonths
 */
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { OptimizerSubnav } from '@/components/optimizer/OptimizerSubnav';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { formatINRCompact } from '@/lib/formatCurrency';
import { TrendingUp, TrendingDown, Minus, ArrowLeft } from 'lucide-react';

const T = {
  overline: { fontFamily: 'Outfit' as const, fontSize: 10, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0 },
  helper:   { fontFamily: 'Plus Jakarta Sans' as const, fontSize: 13, fontWeight: 400 as const, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
};
const CARD = { padding: '20px 24px', border: '1px solid var(--border-subtle)', borderRadius: 14, backgroundColor: 'var(--bg-card)' };

const SCENARIO_COLORS: Record<string, string> = {
  conservative: '#60A5FA',
  current:      '#E8803A',
  growth:       '#A78BFA',
  aggressive:   '#34D399',
};

export default function BudgetScenarios() {
  const {
    isLoading, scenarios, marginalNotes, scenarioInterpretation,
    currentPlan, monthlyBudget, totalPeriodBudget, durationMonths,
  } = useOptimizerModel();

  if (isLoading) return <DashboardSkeleton />;

  const currentScenario = scenarios.find(s => s.key === 'current');

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <OptimizerSubnav />

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Budget Scenarios
        </h1>
        <p style={{ ...T.helper, marginTop: 6 }}>
          What happens to forecasted revenue and ROAS if you change your total budget?
          Each scenario uses the same optimizer engine — allocations are re-optimised at each budget level.
        </p>
        <p style={{ ...T.helper, fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
          Current budget: {formatINRCompact(monthlyBudget)}/mo · {durationMonths} month{durationMonths > 1 ? 's' : ''} · Total: {formatINRCompact(totalPeriodBudget)}
        </p>
      </div>

      {/* ── Scenario KPI cards ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {scenarios.map(s => {
          const color     = SCENARIO_COLORS[s.key] || '#94a3b8';
          const isBase    = s.key === 'current';
          const deltaSign = s.deltaRevenue >= 0 ? '+' : '';
          const DirIcon   = s.deltaRevenue > 0 ? TrendingUp : s.deltaRevenue < 0 ? TrendingDown : Minus;

          return (
            <div key={s.key} style={{ ...CARD, border: isBase ? `1px solid ${color}55` : '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={T.overline}>{s.label}</p>
                {isBase && <span style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: color, backgroundColor: `${color}22`, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' as const }}>Current</span>}
              </div>
              <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '8px 0 2px' }}>
                {formatINRCompact(s.monthlyBudget)}/mo
              </p>
              <p style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 700, color, margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                {formatINRCompact(s.periodRevenue)}
              </p>
              <p style={{ ...T.helper, fontSize: 11, marginTop: 4 }}>
                {s.blendedROAS.toFixed(2)}x ROAS
              </p>
              {!isBase && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <DirIcon size={12} color={s.deltaRevenue >= 0 ? '#34D399' : '#F87171'} />
                  <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: s.deltaRevenue >= 0 ? '#34D399' : '#F87171' }}>
                    {deltaSign}{formatINRCompact(s.deltaRevenue)} vs current
                  </span>
                </div>
              )}
              <div style={{ height: 2, backgroundColor: color, borderRadius: 1, marginTop: 14, opacity: 0.3 }} />
            </div>
          );
        })}
      </div>

      {/* ── Scenario comparison table ─────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
        <div style={{ padding: '20px 24px 14px' }}>
          <p style={T.overline}>Scenario comparison</p>
          <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>Allocation is re-optimised independently at each budget level.</p>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }} />

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) repeat(5, 1fr)', padding: '10px 24px', gap: 8, backgroundColor: 'var(--bg-root)', borderBottom: '1px solid var(--border-subtle)' }}>
          {['Scenario', 'Monthly Budget', 'Period Budget', 'Period Revenue', 'Blended ROAS', 'Δ Revenue'].map(h => (
            <span key={h} style={{ ...T.overline, textAlign: h === 'Scenario' ? 'left' : 'center' }}>{h}</span>
          ))}
        </div>

        {scenarios.map(s => {
          const color   = SCENARIO_COLORS[s.key] || '#94a3b8';
          const isBase  = s.key === 'current';
          return (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) repeat(5, 1fr)', padding: '13px 24px', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', backgroundColor: isBase ? `${color}08` : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: isBase ? 700 : 600, color: 'var(--text-primary)' }}>{s.label}</span>
              </div>
              <span style={{ fontFamily: 'Outfit', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>{formatINRCompact(s.monthlyBudget)}</span>
              <span style={{ fontFamily: 'Outfit', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>{formatINRCompact(s.periodBudget)}</span>
              <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color, textAlign: 'center' }}>{formatINRCompact(s.periodRevenue)}</span>
              <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{s.blendedROAS.toFixed(2)}x</span>
              <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: isBase ? 'var(--text-muted)' : s.deltaRevenue >= 0 ? '#34D399' : '#F87171', textAlign: 'center' }}>
                {isBase ? '—' : `${s.deltaRevenue >= 0 ? '+' : ''}${formatINRCompact(s.deltaRevenue)}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Marginal ROAS between tiers ───────────────────────────────── */}
      {marginalNotes.length > 0 && (
        <div style={{ ...CARD }}>
          <p style={{ ...T.overline, marginBottom: 16 }}>Marginal ROAS between budget tiers</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {marginalNotes.map(n => {
              const effColor = n.marginalROAS >= 3 ? '#34D399' : n.marginalROAS >= 1.5 ? '#E8803A' : '#F87171';
              return (
                <div key={`${n.from}-${n.to}`} style={{ flex: '1 1 200px', padding: '14px 16px', backgroundColor: 'var(--bg-root)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                  <p style={{ ...T.overline, fontSize: 9, marginBottom: 8 }}>{n.from} → {n.to}</p>
                  <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: effColor, letterSpacing: '-0.02em', margin: 0 }}>
                    {n.marginalROAS.toFixed(2)}x
                  </p>
                  <p style={{ ...T.helper, fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                    +{formatINRCompact(n.extraBudget)} spend<br />
                    +{formatINRCompact(n.extraRevenue)} revenue
                  </p>
                </div>
              );
            })}
          </div>
          <p style={{ ...T.helper, fontSize: 11, marginTop: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            Marginal ROAS shows what you earn on the incremental budget between tiers, not the blended average. As budget increases, marginal return falls due to diminishing returns across channels.
          </p>
        </div>
      )}

      {/* ── Interpretation ────────────────────────────────────────────── */}
      {scenarioInterpretation && (
        <div style={{ padding: '16px 20px', borderRadius: 12, backgroundColor: 'rgba(232,128,58,0.08)', border: '1px solid rgba(232,128,58,0.2)' }}>
          <p style={{ ...T.helper, fontSize: 13, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Model view: </strong>
            {scenarioInterpretation}
          </p>
        </div>
      )}

      {/* ── Back CTA → Recommended Mix ───────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Ready to apply the AI recommendation?
          </p>
          <p style={{ ...T.helper, fontSize: 12, marginTop: 6 }}>
            Head back to Recommended Mix to review per-channel deltas and apply the AI allocation in one click.
          </p>
        </div>
        <Link to="/optimizer/recommended" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          <ArrowLeft size={15} /> Back to Recommended Mix
        </Link>
      </div>
    </div>
  );
}

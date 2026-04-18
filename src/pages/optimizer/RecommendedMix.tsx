/**
 * RecommendedMix — Page 3 of Mix Optimiser
 *
 * DATA CONTRACT — reads from model:
 *   currentPlan, optimizedPlan, uplift, recommendations,
 *   durationMonths, monthlyBudget, totalPeriodBudget
 *
 * This is the ONLY page that reads from BOTH currentPlan AND optimizedPlan.
 * Uplift is always derived from those two — never re-computed here.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { OptimizerSubnav } from '@/components/optimizer/OptimizerSubnav';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { useOptimizer } from '@/contexts/OptimizerContext';
import { formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { normalizeAllocationShares } from '@/lib/calculations';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, ArrowRight, RotateCcw } from 'lucide-react';

const T = {
  overline: { fontFamily: 'Outfit' as const, fontSize: 10, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0 },
  helper:   { fontFamily: 'Plus Jakarta Sans' as const, fontSize: 13, fontWeight: 400 as const, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
};
const CARD = { padding: '20px 24px', border: '1px solid var(--border-subtle)', borderRadius: 14, backgroundColor: 'var(--bg-card)' };

export default function RecommendedMix() {
  const {
    isLoading, currentPlan, optimizedPlan, uplift, recommendations,
    totalPeriodBudget, durationMonths, monthlyBudget,
  } = useOptimizerModel();

  const { setAllocations } = useOptimizer();

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  if (isLoading) return <DashboardSkeleton />;

  const toggleRow = (ch: string) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });

  const applyAIMix = () =>
    setAllocations(normalizeAllocationShares({ ...optimizedPlan.allocationShares }));

  const resetToCurrent = () =>
    setAllocations(normalizeAllocationShares({ ...currentPlan.allocationShares }));

  const sortedChannels = [...CHANNELS].sort(
    (a, b) => (recommendations[b]?.deltaPct || 0) - (recommendations[a]?.deltaPct || 0),
  );

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <OptimizerSubnav />

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Recommended Mix
          </h1>
          <p style={{ ...T.helper, marginTop: 6 }}>
            The AI-optimised allocation that maximises expected revenue given the same total budget.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={resetToCurrent} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)', fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <RotateCcw size={13} /> Reset to Current
          </button>
          <button onClick={applyAIMix} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <TrendingUp size={14} /> Apply AI Mix
          </button>
        </div>
      </div>

      {/* ── Uplift KPI strip ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Current Revenue',     value: formatINRCompact(currentPlan.totalPeriodRevenue),   sub: `${currentPlan.blendedROAS.toFixed(2)}x ROAS`,  color: '#64748b' },
          { label: 'Recommended Revenue', value: formatINRCompact(optimizedPlan.totalPeriodRevenue), sub: `${optimizedPlan.blendedROAS.toFixed(2)}x ROAS`, color: '#34D399' },
          {
            label: 'Revenue Uplift',
            value: (uplift.isNearOptimal ? '~' : '') + formatINRCompact(Math.abs(uplift.revenueOpportunity)),
            sub:   uplift.isNearOptimal ? 'Near-optimal already' : `${uplift.upliftPct >= 0 ? '+' : ''}${uplift.upliftPct.toFixed(1)}% vs current`,
            color: uplift.isNearOptimal ? '#A78BFA' : uplift.revenueOpportunity >= 0 ? '#34D399' : '#F87171',
          },
          {
            label: 'ROAS Improvement',
            value: `${uplift.roasImprovement >= 0 ? '+' : ''}${uplift.roasImprovement.toFixed(2)}x`,
            sub:   `${currentPlan.blendedROAS.toFixed(2)}x → ${optimizedPlan.blendedROAS.toFixed(2)}x`,
            color: uplift.roasImprovement >= 0 ? '#E8803A' : '#F87171',
          },
        ].map(k => (
          <div key={k.label} style={{ ...CARD }}>
            <p style={T.overline}>{k.label}</p>
            <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: k.color, letterSpacing: '-0.02em', margin: '6px 0 0' }}>{k.value}</p>
            <p style={{ ...T.helper, fontSize: 11, marginTop: 6 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Near-optimal notice ──────────────────────────────────────── */}
      {uplift.isNearOptimal && (
        <div style={{ padding: '12px 18px', borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <p style={{ ...T.helper, fontSize: 13 }}>
            Your current mix is near the model optimum — reallocating would shift less than 0.35% in forecast revenue. Consider holding unless there are strategic reasons to change.
          </p>
        </div>
      )}

      {/* ── Top movers ───────────────────────────────────────────────── */}
      {!uplift.isNearOptimal && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ ...CARD }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingUp size={14} color="#34D399" />
              <p style={{ ...T.overline, color: '#34D399' }}>Top increases</p>
            </div>
            {uplift.topIncreases.length === 0
              ? <p style={{ ...T.helper, fontSize: 12 }}>No significant increases recommended.</p>
              : uplift.topIncreases.map(r => (
                <div key={r.channel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <ChannelName channel={r.channel} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                  <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#34D399' }}>+{r.deltaPct.toFixed(1)}pp</span>
                </div>
              ))}
          </div>
          <div style={{ ...CARD }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingDown size={14} color="#F87171" />
              <p style={{ ...T.overline, color: '#F87171' }}>Top reductions</p>
            </div>
            {uplift.topReductions.length === 0
              ? <p style={{ ...T.helper, fontSize: 12 }}>No significant reductions recommended.</p>
              : uplift.topReductions.map(r => (
                <div key={r.channel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <ChannelName channel={r.channel} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                  <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#F87171' }}>{r.deltaPct.toFixed(1)}pp</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Channel comparison table ──────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
        <div style={{ padding: '20px 24px 14px' }}>
          <p style={{ ...T.overline }}>Channel comparison — current vs recommended</p>
          <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>Click a row for per-channel rationale and marginal ROAS details.</p>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }} />

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.5fr) 1fr 1fr 70px minmax(160px,2fr)', padding: '10px 24px', gap: 8, backgroundColor: 'var(--bg-root)', borderBottom: '1px solid var(--border-subtle)' }}>
          {['Channel', 'Current', 'Recommended', 'Delta', 'Primary reason'].map(h => (
            <span key={h} style={{ ...T.overline, textAlign: h === 'Channel' || h === 'Primary reason' ? 'left' : 'center' }}>{h}</span>
          ))}
        </div>

        {sortedChannels.map((ch, ci) => {
          const rec    = recommendations[ch];
          const color  = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
          const curRow = currentPlan.channels[ch];
          const recRow = optimizedPlan.channels[ch];
          const dir    = rec?.direction || 'hold';
          const expanded = expandedRows.has(ch);

          const DirIcon = dir === 'increase' ? TrendingUp : dir === 'decrease' ? TrendingDown : Minus;
          const dirColor = dir === 'increase' ? '#34D399' : dir === 'decrease' ? '#F87171' : '#94a3b8';

          return (
            <div key={ch} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button onClick={() => toggleRow(ch)} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.5fr) 1fr 1fr 70px minmax(160px,2fr)', padding: '13px 24px', gap: 8, alignItems: 'center', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {expanded ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
                  <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                </div>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>{(curRow?.allocationPct || 0).toFixed(1)}%</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{(rec?.recommendedPct || 0).toFixed(1)}%</span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: dirColor }}>
                  <DirIcon size={12} />
                  {(rec?.deltaPct || 0) >= 0 ? '+' : ''}{(rec?.deltaPct || 0).toFixed(1)}pp
                </span>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rec?.primaryReasonCode || ''}
                </span>
              </button>

              {expanded && (
                <div style={{ padding: '12px 56px 18px', backgroundColor: 'var(--bg-root)', borderTop: '1px solid var(--border-subtle)' }}>
                  <p style={{ ...T.helper, fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>{rec?.explanation}</p>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>Current spend/mo</p>
                      <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{formatINRCompact(curRow?.spend || 0)}</p>
                    </div>
                    <div>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>Recommended spend/mo</p>
                      <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: '#34D399', margin: 0 }}>{formatINRCompact(recRow?.spend || 0)}</p>
                    </div>
                    <div>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>Marginal ROAS @ current</p>
                      <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{(curRow?.marginalROAS || 0).toFixed(2)}x</p>
                    </div>
                    <div>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 4 }}>Marginal ROAS @ recommended</p>
                      <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: '#E8803A', margin: 0 }}>{(recRow?.marginalROAS || 0).toFixed(2)}x</p>
                    </div>
                  </div>
                  {(rec?.reasonCodes?.length || 0) > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {rec!.reasonCodes.map(code => (
                        <span key={code} style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '3px 9px', borderRadius: 4 }}>
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── CTA → Why It Works ────────────────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Want to understand why the model chose this allocation?
          </p>
          <p style={{ ...T.helper, fontSize: 12, marginTop: 6 }}>
            Why It Works explains diminishing returns, seasonality, and day-of-week effects channel by channel.
          </p>
        </div>
        <Link to="/optimizer/why" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          See Why It Works <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

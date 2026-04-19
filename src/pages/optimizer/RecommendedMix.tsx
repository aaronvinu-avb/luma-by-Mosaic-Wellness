/**
 * RecommendedMix — Page 3 of Mix Optimiser
 *
 * DATA CONTRACT — reads from both current AND optimized state:
 *   currentPlan, optimizedPlan, uplift, recommendations, explanation
 *   durationMonths, monthlyBudget, totalPeriodBudget
 *
 * Must NOT read: diagnosis, raw calibration tables
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { useOptimizer } from '@/contexts/OptimizerContext';
import { formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { normalizeAllocationShares } from '@/lib/optimizer/calculations';
import {
  TrendingUp, TrendingDown, Minus, ArrowRight, ArrowLeft,
  ChevronDown, ChevronRight, CheckCircle2, Sparkles, ShieldAlert,
  Zap, Activity,
} from 'lucide-react';
import type { ChannelRecommendation } from '@/lib/optimizerTypes';
import { T, CARD, badgeStyle, dotStyle, ACTION_META } from './_shared/ui';

// Table column template — shared between header and rows
//   chevron · channel · current % · rec'd % · spend (mo) · change · rec'd ROAS · action
const COL = '18px minmax(140px,1fr) 78px 86px minmax(108px,1.1fr) 88px 88px 82px';

// Confidence tier styling
const CONFIDENCE_META = {
  high:        { label: 'High confidence',   color: '#34D399', bg: 'rgba(52,211,153,0.10)'  },
  moderate:    { label: 'Moderate confidence',color: '#FBBF24', bg: 'rgba(251,191,36,0.10)'  },
  exploratory: { label: 'Exploratory',        color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
} as const;

function actionMeta(rec: ChannelRecommendation) {
  return ACTION_META[rec.direction];
}

function deltaColor(delta: number): string {
  if (delta > 0.5)  return '#34D399';
  if (delta < -0.5) return '#F87171';
  return '#94a3b8';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecommendedMix() {
  const {
    isLoading,
    currentPlan, optimizedPlan,
    uplift, recommendations, explanation,
    totalPeriodBudget, durationMonths, monthlyBudget,
  } = useOptimizerModel();

  const { setAllocations } = useOptimizer();

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (ch: string) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });

  const applyRecommendedMix = () =>
    setAllocations(normalizeAllocationShares({ ...optimizedPlan.allocationShares }));

  // Sort: biggest changes (by |delta|) first
  const sortedChannels = useMemo(() =>
    [...CHANNELS].sort((a, b) =>
      Math.abs(recommendations[b]?.deltaPct || 0) - Math.abs(recommendations[a]?.deltaPct || 0)
    ),
  [recommendations]);

  if (isLoading) return <DashboardSkeleton />;

  // ── Derived display values ─────────────────────────────────────────────────
  const confidence   = uplift.upliftConfidence;
  const confMeta     = CONFIDENCE_META[confidence.tier];
  const meaningfulChanges = CHANNELS.filter(ch => Math.abs(recommendations[ch]?.deltaPct || 0) >= 1).length;
  const upliftSign   = uplift.revenueOpportunity >= 0;
  const nearOptimal  = uplift.isNearOptimal;

  // Impact summary helpers
  const topGainer   = uplift.topIncreases[0];
  const topReducer  = uplift.topReductions[0];
  const highVolChannels = CHANNELS.filter(ch => explanation[ch]?.isHighVolatility && recommendations[ch]?.direction === 'increase');

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── A. Page Header ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontFamily: 'Outfit', fontSize: 26, fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0,
          }}>
            Recommended Mix
          </h1>
          <p style={{
            fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 400,
            color: 'var(--text-secondary)', margin: '5px 0 0', lineHeight: 1.5,
          }}>
            Optimized allocation based on tuned efficiency and diminishing returns.
          </p>
        </div>

        {/* Apply action */}
        <button
          onClick={applyRecommendedMix}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 9,
            background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
            color: '#000', fontFamily: 'Outfit', fontSize: 12, fontWeight: 700,
            border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', marginTop: 2,
          }}
        >
          <Sparkles size={13} /> Apply This Mix
        </button>
      </div>

      {/* ── B. Recommendation Summary Strip ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>

        {/* Recommended Revenue */}
        <div style={{ padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: 12, backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
          <p style={{ ...T.overline, fontSize: 9 }}>Recommended Revenue</p>
          <p style={{ ...T.num, fontWeight: 800, fontSize: 20, color: '#34D399', letterSpacing: '-0.025em', margin: '7px 0 4px' }}>
            {formatINRCompact(optimizedPlan.totalPeriodRevenue)}
          </p>
          <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, flex: 1 }}>
            Modeled revenue under the optimized allocation
          </p>
          <div style={{ height: 2, backgroundColor: '#34D399', borderRadius: 1, marginTop: 10, opacity: 0.3 }} />
        </div>

        {/* Recommended ROAS */}
        <div style={{ padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: 12, backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
          <p style={{ ...T.overline, fontSize: 9 }}>Recommended Blended ROAS</p>
          <p style={{ ...T.num, fontWeight: 800, fontSize: 20, color: '#E8803A', letterSpacing: '-0.025em', margin: '7px 0 4px' }}>
            {optimizedPlan.blendedROAS.toFixed(2)}x
          </p>
          <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, flex: 1 }}>
            Weighted return across the optimized channel mix
          </p>
          <div style={{ height: 2, backgroundColor: '#E8803A', borderRadius: 1, marginTop: 10, opacity: 0.3 }} />
        </div>

        {/* Expected Uplift */}
        <div style={{ padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: 12, backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
          <p style={{ ...T.overline, fontSize: 9 }}>Expected Uplift</p>
          <p style={{ ...T.num, fontWeight: 800, fontSize: 20, letterSpacing: '-0.025em', margin: '7px 0 4px',
            color: nearOptimal ? '#94a3b8' : upliftSign ? '#34D399' : '#F87171',
          }}>
            {nearOptimal
              ? '≈ 0%'
              : `${upliftSign ? '+' : ''}${uplift.upliftPct.toFixed(1)}%`}
          </p>
          <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, flex: 1 }}>
            {nearOptimal
              ? 'Current mix is near-optimal — minimal revenue gain available'
              : `${upliftSign ? '+' : ''}${formatINRCompact(Math.abs(uplift.revenueOpportunity))} vs current forecast`}
          </p>
          <div style={{ height: 2, backgroundColor: upliftSign ? '#34D399' : '#F87171', borderRadius: 1, marginTop: 10, opacity: 0.3 }} />
        </div>

        {/* Recommendation Confidence */}
        <div style={{ padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: 12, backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
          <p style={{ ...T.overline, fontSize: 9 }}>Recommendation Confidence</p>
          <p style={{ ...T.num, fontWeight: 800, fontSize: 16, color: confMeta.color, letterSpacing: '-0.015em', margin: '7px 0 4px', lineHeight: 1.2 }}>
            {confMeta.label}
          </p>
          <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, flex: 1 }}>
            {confidence.note}
          </p>
          <div style={{ height: 2, backgroundColor: confMeta.color, borderRadius: 1, marginTop: 10, opacity: 0.3 }} />
        </div>
      </div>

      {/* Near-optimal notice */}
      {nearOptimal && (
        <div style={{
          padding: '13px 16px', borderRadius: 9,
          backgroundColor: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <CheckCircle2 size={15} color="#A78BFA" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ ...T.body, fontSize: 13, color: 'var(--text-secondary)' }}>
            Your current mix is close to the model optimum. Reallocating would change the revenue forecast by less than 0.35%. Consider holding this allocation unless there are strategic reasons to shift.
          </p>
        </div>
      )}

      {/* ── C. Current vs Recommended Comparison ─────────────────────────── */}
      <div style={{ ...CARD }}>
        <p style={{ ...T.overline, marginBottom: 18 }}>Current vs Recommended</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 0, alignItems: 'center' }}>

          {/* Current column */}
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-root)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
            <p style={{ ...T.overline, fontSize: 9, marginBottom: 14, color: 'var(--text-muted)' }}>Current Mix</p>
            {[
              { k: 'Revenue forecast', v: formatINRCompact(currentPlan.totalPeriodRevenue) },
              { k: 'Blended ROAS',     v: `${currentPlan.blendedROAS.toFixed(2)}x` },
              { k: 'Total budget',     v: `${formatINRCompact(monthlyBudget)}/mo` },
              { k: 'Planning period',  v: `${durationMonths} month${durationMonths > 1 ? 's' : ''}` },
            ].map(({ k, v }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ ...T.body, fontSize: 12 }}>{k}</span>
                <span style={{ ...T.num, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Arrow separator */}
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <ArrowRight size={18} color="rgba(232,128,58,0.6)" />
            {!nearOptimal && (
              <span style={badgeStyle(upliftSign ? '#34D399' : '#F87171')}>
                {upliftSign ? '+' : ''}{uplift.upliftPct.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Recommended column */}
          <div style={{ padding: '14px 18px', backgroundColor: 'rgba(52,211,153,0.04)', borderRadius: 9, border: '1px solid rgba(52,211,153,0.18)' }}>
            <p style={{ ...T.overline, fontSize: 9, marginBottom: 14, color: '#34D399' }}>Recommended Mix</p>
            {[
              { k: 'Revenue forecast', v: formatINRCompact(optimizedPlan.totalPeriodRevenue), highlight: upliftSign },
              { k: 'Blended ROAS',     v: `${optimizedPlan.blendedROAS.toFixed(2)}x`,        highlight: uplift.roasImprovement > 0 },
              { k: 'Total budget',     v: `${formatINRCompact(monthlyBudget)}/mo`,            highlight: false },
              { k: 'Changes',          v: `${meaningfulChanges} channel${meaningfulChanges !== 1 ? 's' : ''} shift`,  highlight: false },
            ].map(({ k, v, highlight }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(52,211,153,0.12)' }}>
                <span style={{ ...T.body, fontSize: 12 }}>{k}</span>
                <span style={{ ...T.num, fontSize: 13, fontWeight: 700, color: highlight ? '#34D399' : 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── D. Biggest Increases / Reductions ────────────────────────────── */}
      {!nearOptimal && (uplift.topIncreases.length > 0 || uplift.topReductions.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* Increases */}
          <div style={{ ...CARD, borderColor: 'rgba(52,211,153,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <TrendingUp size={13} color="#34D399" />
              <p style={{ ...T.overline, color: '#34D399' }}>Increase Budget</p>
            </div>
            {uplift.topIncreases.length === 0 ? (
              <p style={{ ...T.body, fontSize: 12, fontStyle: 'italic' }}>No increases recommended.</p>
            ) : uplift.topIncreases.map(r => {
              const color = CHANNEL_COLORS[CHANNELS.indexOf(r.channel) % CHANNEL_COLORS.length];
              return (
                <div key={r.channel} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                    <ChannelName channel={r.channel} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }} />
                    <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: '#34D399' }}>
                      +{r.deltaPct.toFixed(1)}%
                    </span>
                  </div>
                  <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, marginLeft: 15 }}>
                    {r.currentPct.toFixed(1)}% → {r.recommendedPct.toFixed(1)}% · {r.primaryReasonCode}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Reductions */}
          <div style={{ ...CARD, borderColor: 'rgba(248,113,113,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <TrendingDown size={13} color="#F87171" />
              <p style={{ ...T.overline, color: '#F87171' }}>Reduce Budget</p>
            </div>
            {uplift.topReductions.length === 0 ? (
              <p style={{ ...T.body, fontSize: 12, fontStyle: 'italic' }}>No reductions recommended.</p>
            ) : uplift.topReductions.map(r => {
              const color = CHANNEL_COLORS[CHANNELS.indexOf(r.channel) % CHANNEL_COLORS.length];
              return (
                <div key={r.channel} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                    <ChannelName channel={r.channel} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }} />
                    <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: '#F87171' }}>
                      {r.deltaPct.toFixed(1)}%
                    </span>
                  </div>
                  <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, marginLeft: 15 }}>
                    {r.currentPct.toFixed(1)}% → {r.recommendedPct.toFixed(1)}% · {r.primaryReasonCode}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── E. Recommended Allocation Table ──────────────────────────────── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>

        {/* Toolbar — tight */}
        <div style={{
          padding: '14px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ ...T.overline, fontSize: 10 }}>Full channel comparison</p>
          <p style={{ ...T.body, fontSize: 11, color: 'var(--text-muted)' }}>
            {sortedChannels.length} channels · click a row for detail
          </p>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: COL,
          padding: '8px 22px', gap: 10,
          backgroundColor: 'var(--bg-root)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {[
            { h: '',            align: 'left'   },
            { h: 'Channel',     align: 'left'   },
            { h: 'Current',     align: 'right'  },
            { h: 'Recommended', align: 'right'  },
            { h: 'SPEND (MO)',  align: 'right'  },
            { h: 'Change',      align: 'center' },
            { h: 'Forecast ROAS', align: 'right'  },
            { h: 'Action',      align: 'center' },
          ].map(({ h, align }, i) => (
            <span key={i} style={{ ...T.overline, fontSize: 9, textAlign: align as React.CSSProperties['textAlign'] }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {sortedChannels.map(ch => {
          const color    = CHANNEL_COLORS[CHANNELS.indexOf(ch) % CHANNEL_COLORS.length];
          const rec      = recommendations[ch];
          const curRow   = currentPlan.channels[ch];
          const recRow   = optimizedPlan.channels[ch];
          const expl     = explanation[ch];
          const isOpen   = expandedRows.has(ch);
          const action   = rec ? actionMeta(rec) : { label: 'Hold' as const, color: '#94a3b8' };
          const delta    = rec?.deltaPct ?? 0;
          const dColor   = deltaColor(delta);

          // Monthly spend from live budget (same `monthlyBudget` as Current Mix / KPIs)
          const recPct = rec?.recommendedPct ?? 0;
          const curPct = rec?.currentPct ?? curRow?.allocationPct ?? 0;
          const recSpendMo = (recPct / 100) * monthlyBudget;
          const curSpendMo = (curPct / 100) * monthlyBudget;

          // Channel-level ROAS under the recommended allocation
          const recROAS  = recRow && recRow.spend > 0 ? recRow.revenue / recRow.spend : 0;

          const DirIcon  = delta > 0.5 ? TrendingUp : delta < -0.5 ? TrendingDown : Minus;

          return (
            <div key={ch} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {/* Main row — summary only */}
              <div
                onClick={() => toggleRow(ch)}
                style={{
                  display: 'grid', gridTemplateColumns: COL,
                  padding: '11px 22px', gap: 10, alignItems: 'center',
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'background-color 120ms ease',
                  backgroundColor: isOpen ? 'var(--bg-root)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.015)'; }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {/* Chevron */}
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>

                {/* Channel identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <ChannelName channel={ch} style={{
                    fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600,
                    color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }} />
                </div>

                {/* Current % */}
                <p style={{ ...T.num, fontSize: 12, color: 'var(--text-muted)', margin: 0, textAlign: 'right' }}>
                  {(curRow?.allocationPct || 0).toFixed(1)}%
                </p>

                {/* Recommended % — emphasized */}
                <p style={{ ...T.num, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, textAlign: 'right' }}>
                  {(rec?.recommendedPct || 0).toFixed(1)}%
                </p>

                {/* SPEND (MO) — (pct / 100) × monthlyBudget; secondary = current mix at same budget */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {formatINRCompact(recSpendMo)}
                  </p>
                  <p style={{ ...T.body, fontSize: 10, color: 'var(--text-muted)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    was {formatINRCompact(curSpendMo)}
                  </p>
                </div>

                {/* Change — quiet direction indicator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <DirIcon size={11} color={dColor} strokeWidth={2.25} />
                  <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: dColor }}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                  </span>
                </div>

                {/* Recommended ROAS */}
                <p style={{ ...T.num, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, textAlign: 'right' }}>
                  {recROAS > 0 ? `${recROAS.toFixed(2)}x` : '—'}
                </p>

                {/* Action chip */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={badgeStyle(action.color)}>
                    <span style={dotStyle(action.color)} />
                    {action.label}
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{
                  padding: '4px 22px 18px',
                  borderTop: `1px solid ${action.color}1E`,
                  backgroundColor: 'var(--bg-root)',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>

                    {/* Allocation & spend detail */}
                    <div style={{ padding: '13px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Allocation & spend</p>
                      {[
                        { k: 'Current allocation',     v: `${(rec?.currentPct || 0).toFixed(1)}%` },
                        { k: 'Recommended',            v: `${(rec?.recommendedPct || 0).toFixed(1)}%` },
                        { k: 'Monthly spend (rec)',   v: formatINRCompact(recRow?.spend || 0) },
                        { k: "Rec'd period revenue",  v: formatINRCompact(recRow?.periodRevenue || 0) },
                      ].map(({ k, v }) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                          <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                          <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ ...T.body, fontSize: 11 }}>Marginal ROAS (cur → rec)</span>
                        <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {(curRow?.marginalROAS || 0).toFixed(2)}x → {(recRow?.marginalROAS || 0).toFixed(2)}x
                        </span>
                      </div>
                    </div>

                    {/* Efficiency signal */}
                    <div style={{ padding: '13px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Efficiency signal</p>
                      {expl ? (
                        <>
                          {[
                            { k: 'Tuned ROAS',     v: `${expl.tunedROAS.toFixed(2)}x` },
                            { k: 'Blended median', v: `${expl.portfolioROAS.toFixed(2)}x` },
                            { k: 'vs blended',     v: (() => {
                              const gap = (expl.tunedROAS - expl.portfolioROAS) / expl.portfolioROAS * 100;
                              return gap > 5 ? `+${Math.round(gap)}% above` : gap < -5 ? `${Math.round(gap)}% below` : 'In line';
                            })() },
                          ].map(({ k, v }) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                              <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                              <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                            </div>
                          ))}
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(() => {
                              const c = expl.efficiencyConfidence >= 0.7 ? '#34D399'
                                      : expl.efficiencyConfidence >= 0.38 ? '#FBBF24'
                                      : '#94a3b8';
                              const label = expl.efficiencyConfidence >= 0.7 ? 'Strong signal'
                                          : expl.efficiencyConfidence >= 0.38 ? 'Moderate signal'
                                          : 'Thin data';
                              return (
                                <span style={badgeStyle(c)}>
                                  <Zap size={9} /> {label}
                                </span>
                              );
                            })()}
                            {expl.isHighVolatility && (
                              <span style={badgeStyle('#F87171')}>
                                <Activity size={9} /> High Risk
                              </span>
                            )}
                            {expl.isSaturated && (
                              <span style={badgeStyle('#F87171')}>
                                <ShieldAlert size={9} /> Saturated
                              </span>
                            )}
                          </div>
                        </>
                      ) : <p style={T.body}>No signal data available.</p>}
                    </div>

                    {/* Rationale */}
                    <div style={{ padding: '13px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: `1px solid ${action.color}22` }}>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Why this change</p>
                      <p style={{ ...T.body, fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                        {rec?.explanation || `No significant change — holding at current allocation.`}
                      </p>
                      {(rec?.reasonCodes?.length || 0) > 0 && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
                          {rec!.reasonCodes.map(code => (
                            <span key={code} style={{
                              fontFamily: 'Outfit', fontSize: 10, fontWeight: 600,
                              color: 'var(--text-muted)', backgroundColor: 'var(--bg-root)',
                              border: '1px solid var(--border-subtle)',
                              padding: '4px 9px', borderRadius: 999,
                              letterSpacing: '0.02em', whiteSpace: 'nowrap',
                            }}>
                              {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── F. Impact Summary ────────────────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <p style={{ ...T.overline }}>Impact Summary</p>
          <span style={badgeStyle(confMeta.color)}>
            <span style={dotStyle(confMeta.color)} />
            {confMeta.label}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>

          {/* Primary gain source */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <TrendingUp size={12} color="#34D399" />
              <p style={{ ...T.label, color: '#34D399' }}>Primary gain source</p>
            </div>
            <p style={{ ...T.body, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {topGainer
                ? `The biggest forecast gain comes from increasing ${topGainer.channel} allocation from ${topGainer.currentPct.toFixed(1)}% to ${topGainer.recommendedPct.toFixed(1)}%. ${topGainer.primaryReasonCode}.`
                : 'No single channel dominates the improvement — gains are distributed across the mix.'}
            </p>
          </div>

          {/* Main reductions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <TrendingDown size={12} color="#F87171" />
              <p style={{ ...T.label, color: '#F87171' }}>Budget freed by reductions</p>
            </div>
            <p style={{ ...T.body, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {topReducer
                ? `${topReducer.channel} is the primary reduction — from ${topReducer.currentPct.toFixed(1)}% to ${topReducer.recommendedPct.toFixed(1)}%. ${topReducer.primaryReasonCode}. This budget is redirected to higher-efficiency channels.`
                : 'No significant reductions are required in the current mix.'}
            </p>
          </div>

          {/* Risk / caution + takeaway */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <Minus size={12} color="var(--text-muted)" />
              <p style={{ ...T.label }}>Strategic takeaway</p>
            </div>
            <p style={{ ...T.body, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {nearOptimal
                ? `Your current mix is already near the model optimum at ${currentPlan.blendedROAS.toFixed(2)}x blended ROAS. No major reallocation is needed unless strategic priorities change.`
                : `Reallocating to the recommended mix is forecast to improve blended ROAS from ${currentPlan.blendedROAS.toFixed(2)}x to ${optimizedPlan.blendedROAS.toFixed(2)}x.`}
              {highVolChannels.length > 0
                ? ` Note: ${highVolChannels.join(', ')} ${highVolChannels.length > 1 ? 'have' : 'has'} high signal volatility — treat ${highVolChannels.length > 1 ? 'these' : 'this'} channel's increase cautiously.`
                : ''}
              {confidence.tier === 'exploratory' ? ` This recommendation is exploratory — model confidence is limited by thin historical data.` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── G. Next-step CTA ─────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap' as const,
        borderColor: 'rgba(232,128,58,0.22)',
      }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Want to understand the reasoning behind this recommendation?
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 5 }}>
            Why It Works explains the diminishing returns curves, timing effects, and signal quality that drive each channel's allocation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <Link to="/optimizer/diagnosis" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 15px', borderRadius: 9,
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)',
            fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}>
            <ArrowLeft size={13} /> Back to Diagnosis
          </Link>
          <Link to="/optimizer/why" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 9,
            background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
            color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
          }}>
            See Why It Works <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

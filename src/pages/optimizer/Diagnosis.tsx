/**
 * Diagnosis — Page 2 of Mix Optimiser
 *
 * DATA CONTRACT — reads from model:
 *   diagnosis, flaggedChannels, overWeightedChannels, underWeightedChannels,
 *   currentPlan, portfolioROAS, explanation, historicalFractions
 *
 * Must NOT read: optimizedPlan, uplift, recommendations
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import {
  CheckCircle2, AlertTriangle, TrendingDown, TrendingUp, Minus,
  ArrowRight, ArrowLeft, ChevronDown, ChevronRight,
  ShieldAlert, Activity, Zap, Clock,
} from 'lucide-react';
import {
  T, CARD, badgeStyle, dotStyle,
  STATUS_META as STATUS_META_BASE, STATUS_ORDER, type StatusKey,
} from './_shared/ui';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Per-status icon mapping (Diagnosis adds a visual glyph to each status row).
const STATUS_ICON = {
  efficient:      CheckCircle2,
  saturated:      TrendingDown,
  'over-scaled':  AlertTriangle,
  'under-scaled': TrendingUp,
  'high-risk':    ShieldAlert,
} as const;

// Merge icons into the shared status meta for local use.
const STATUS_META = Object.fromEntries(
  (Object.keys(STATUS_META_BASE) as StatusKey[]).map(k => [
    k,
    { ...STATUS_META_BASE[k], Icon: STATUS_ICON[k] },
  ]),
) as Record<StatusKey, { label: string; color: string; Icon: typeof CheckCircle2 }>;

// ── Derived signal helpers ─────────────────────────────────────────────────────

function efficiencyLabel(score: number): { text: string; color: string } {
  if (score >= 0.70) return { text: 'Strong',   color: '#34D399' };
  if (score >= 0.38) return { text: 'Moderate', color: '#FBBF24' };
  return               { text: 'Weak',     color: '#94a3b8' };
}

function stabilityLabel(isHighVolatility: boolean, stabilityScore: number): { text: string; color: string } {
  if (isHighVolatility)          return { text: 'Volatile', color: '#F87171' };
  if (stabilityScore < 0.45)     return { text: 'Mixed',    color: '#FBBF24' };
  return                           { text: 'Stable',   color: '#34D399' };
}

function spendPressureLabel(
  isOverWeighted: boolean,
  isUnderWeighted: boolean,
  isSaturated: boolean,
): { text: string; color: string } {
  if (isSaturated || isOverWeighted)  return { text: 'Above efficient range',  color: '#F87171' };
  if (isUnderWeighted)                return { text: 'Below efficient range',  color: '#60A5FA' };
  return                               { text: 'In range',                    color: '#34D399' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Diagnosis() {
  const {
    isLoading, currentPlan, diagnosis, flaggedChannels,
    overWeightedChannels, underWeightedChannels, portfolioROAS, monthlyBudget,
    explanation, historicalFractions,
  } = useOptimizerModel();

  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [expandedRows,  setExpandedRows]  = useState<Set<string>>(new Set());

  const toggleFlag = (ch: string) =>
    setExpandedFlags(prev => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });
  const toggleRow = (ch: string) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });

  if (isLoading) return <DashboardSkeleton />;

  // Derived counts
  const efficientCount    = CHANNELS.filter(ch => !diagnosis[ch]?.isFlagged).length;
  const saturatedCount    = CHANNELS.filter(ch => diagnosis[ch]?.isSaturated).length;
  const highRiskCount     = CHANNELS.filter(ch => explanation[ch]?.isHighVolatility && diagnosis[ch]?.isFlagged).length;

  // Top performers by tunedROAS
  const topChannels = [...CHANNELS]
    .filter(ch => explanation[ch])
    .sort((a, b) => (explanation[b]?.tunedROAS || 0) - (explanation[a]?.tunedROAS || 0))
    .slice(0, 3);

  // Sorted rows for matrix: worst issues first, then efficient by revenue
  const sortedChannels = [...CHANNELS].sort((a, b) => {
    const sa = STATUS_ORDER[diagnosis[a]?.status ?? 'efficient'] ?? 3;
    const sb = STATUS_ORDER[diagnosis[b]?.status ?? 'efficient'] ?? 3;
    if (sa !== sb) return sa - sb;
    return (currentPlan.channels[b]?.periodRevenue || 0) - (currentPlan.channels[a]?.periodRevenue || 0);
  });

  // Directional takeaway copy
  const takeaway = (() => {
    const saturatedList = CHANNELS.filter(ch => diagnosis[ch]?.isSaturated);
    const overList      = overWeightedChannels.filter(ch => !diagnosis[ch]?.isSaturated);
    const underList     = underWeightedChannels;
    const parts: string[] = [];
    if (saturatedList.length > 0)
      parts.push(`${saturatedList.join(' and ')} ${saturatedList.length > 1 ? 'are' : 'is'} showing saturation — marginal return is at or below breakeven`);
    if (overList.length > 0)
      parts.push(`${overList.join(', ')} ${overList.length > 1 ? 'are' : 'is'} receiving more budget than historical efficiency justifies`);
    if (underList.length > 0)
      parts.push(`${underList.join(', ')} ${underList.length > 1 ? 'appear' : 'appears'} under-invested relative to tuned return profile`);
    if (parts.length === 0)
      return `All channels appear well-balanced relative to historical efficiency benchmarks. The optimizer may still find marginal improvements.`;
    return parts.join('. ') + '. The Recommended Mix will quantify how much of this gap can be closed.';
  })();

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── A. Page Header ────────────────────────────────────────────────── */}
      <div>
        <h1 style={{
          fontFamily: 'Outfit', fontSize: 26, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0,
        }}>
          Diagnosis
        </h1>
        <p style={{
          fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 400,
          color: 'var(--text-secondary)', margin: '5px 0 0', lineHeight: 1.5,
        }}>
          See which channels are over-invested, under-invested, or on track.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={badgeStyle('#E8803A')}>
            <span style={dotStyle('#E8803A')} />
            Blended ROAS (current): {currentPlan.blendedROAS.toFixed(2)}x
          </span>
          <span style={badgeStyle('#94a3b8')}>
            <span style={dotStyle('#94a3b8')} />
            Monthly budget: {formatINRCompact(monthlyBudget)}
          </span>
        </div>
      </div>

      {/* ── B. Channel Health Overview ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[
          {
            label: 'On Track',
            count: efficientCount,
            color: '#34D399',
            note: 'Within model-efficient range',
            Icon: CheckCircle2,
          },
          {
            label: 'Flagged',
            count: flaggedChannels.length,
            color: '#FBBF24',
            note: 'Need attention before proceeding',
            Icon: AlertTriangle,
          },
          {
            label: 'Saturated',
            count: saturatedCount,
            color: '#F87171',
            note: 'Marginal ROAS at or below breakeven',
            Icon: TrendingDown,
          },
          {
            label: 'Over-weighted',
            count: overWeightedChannels.length,
            color: '#FBBF24',
            note: 'More budget than efficiency justifies',
            Icon: ShieldAlert,
          },
          {
            label: 'Under-invested',
            count: underWeightedChannels.length,
            color: '#60A5FA',
            note: 'Efficient but underfunded',
            Icon: TrendingUp,
          },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px 16px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            backgroundColor: 'var(--bg-card)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ ...T.overline, fontSize: 9 }}>{s.label}</p>
              <s.Icon size={11} color={s.color} />
            </div>
            <p style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
              color: 'var(--text-primary)', letterSpacing: '-0.025em', margin: '0 0 5px',
            }}>
              {s.count}
            </p>
            <p style={{ ...T.body, fontSize: 10, lineHeight: 1.4, flex: 1 }}>{s.note}</p>
            <div style={{ height: 2, backgroundColor: s.color, borderRadius: 1, marginTop: 10, opacity: 0.28 }} />
          </div>
        ))}
      </div>

      {/* ── C. Flagged Channels ───────────────────────────────────────────── */}
      {flaggedChannels.length > 0 && (
        <div style={{ ...CARD }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <p style={{ ...T.overline, marginBottom: 4 }}>Channels requiring attention</p>
              <p style={{ ...T.body, fontSize: 12 }}>
                {flaggedChannels.length} channel{flaggedChannels.length > 1 ? 's are' : ' is'} flagged. Expand each for a detailed breakdown.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flaggedChannels.map(ch => {
              const d      = diagnosis[ch];
              const row    = currentPlan.channels[ch];
              const expl   = explanation[ch];
              const status = (d?.status || 'efficient') as StatusKey;
              const st     = STATUS_META[status];
              const Icon   = st.Icon;
              const histPct = Math.round((historicalFractions[ch] || 0) * 100);
              const isOpen  = expandedFlags.has(ch);
              const eff     = expl ? efficiencyLabel(expl.efficiencyConfidence) : { text: '—', color: 'var(--text-muted)' };
              const stab    = expl ? stabilityLabel(expl.isHighVolatility, expl.stabilityScore) : { text: '—', color: 'var(--text-muted)' };
              const press   = spendPressureLabel(!!d?.isOverWeighted, !!d?.isUnderWeighted, !!d?.isSaturated);

              return (
                <div key={ch} style={{
                  border: `1px solid ${st.color}2A`,
                  borderRadius: 9,
                  overflow: 'hidden',
                  backgroundColor: 'var(--bg-root)',
                }}>
                  {/* Header row */}
                  <button
                    onClick={() => toggleFlag(ch)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '13px 16px',
                      background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <Icon size={14} color={st.color} style={{ flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <ChannelName channel={ch} style={{
                          fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 700,
                          color: 'var(--text-primary)',
                        }} />
                        <span style={badgeStyle(st.color)}>
                          <span style={dotStyle(st.color)} />
                          {st.label}
                        </span>
                      </div>
                      <p style={{ ...T.body, fontSize: 12, marginTop: 3, color: 'var(--text-secondary)' }}>
                        {d?.reasonCode}
                      </p>
                    </div>

                    {/* Inline signal tags */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                      {[
                        { icon: <Zap size={9} />,      text: eff.text,  color: eff.color },
                        { icon: <Activity size={9} />, text: stab.text, color: stab.color },
                      ].map(tag => (
                        <span key={tag.text} style={badgeStyle(tag.color)}>
                          {tag.icon} {tag.text}
                        </span>
                      ))}
                    </div>

                    {isOpen ? <ChevronDown size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} /> : <ChevronRight size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: `1px solid ${st.color}1A`,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>

                        {/* Performance Signal */}
                        <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                          <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Performance Signal</p>
                          {expl && [
                            { k: 'Tuned ROAS',     v: `${expl.tunedROAS.toFixed(2)}x` },
                            { k: 'Blended median', v: `${expl.portfolioROAS.toFixed(2)}x` },
                            { k: 'vs blended', v: (() => {
                              const gap = ((expl.tunedROAS - expl.portfolioROAS) / expl.portfolioROAS) * 100;
                              return gap > 5 ? `+${Math.round(gap)}% above` : gap < -5 ? `${Math.round(gap)}% below` : 'In line';
                            })() },
                            { k: 'Marginal ROAS',    v: `${(expl.marginalROASAtCurrent || 0).toFixed(2)}x` },
                          ].map(({ k, v }) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                              <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                              <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                            </div>
                          ))}
                          <p style={{ ...T.body, fontSize: 11, marginTop: 8, lineHeight: 1.45, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                            {expl.isHighVolatility
                              ? 'Month-to-month variance is high. The model uses a smoothed tuned ROAS to reduce noise.'
                              : `Data signal is ${eff.text.toLowerCase()}. Model confidence is ${Math.round(expl.efficiencyConfidence * 100)}%.`}
                          </p>
                        </div>

                        {/* Spend Pressure */}
                        <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                          <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Spend Pressure</p>
                          {d && [
                            { k: 'Current allocation', v: `${(row?.allocationPct || 0).toFixed(1)}%` },
                            { k: 'Historical baseline', v: `${histPct}%` },
                            { k: 'Delta', v: `${d.deltaPct >= 0 ? '+' : ''}${d.deltaPct.toFixed(0)}%` },
                            { k: 'Current spend', v: formatINRCompact(d.currentSpend) },
                            {
                              k: 'Efficient range',
                              v: `${formatINRCompact(d.lowerEfficientSpend)} - ${Number.isFinite(d.upperEfficientSpend) ? formatINRCompact(d.upperEfficientSpend) : 'Open-ended'}`,
                            },
                            {
                              k: 'Saturation threshold',
                              v: Number.isFinite(d.saturationSpend) ? formatINRCompact(d.saturationSpend) : 'Not reached in observed range',
                            },
                          ].map(({ k, v }) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', gap: 8 }}>
                              <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                              <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{v}</span>
                            </div>
                          ))}
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                            <span style={badgeStyle(press.color)}>
                              <span style={dotStyle(press.color)} />
                              {press.text}
                            </span>
                            {d.isSaturated && (
                              <p style={{ ...T.body, fontSize: 11, marginTop: 6, color: '#F87171' }}>
                                Marginal return is at or below breakeven. Additional spend here returns less than ₹1.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Stability */}
                        <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                          <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Stability</p>
                          {expl && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ ...T.body, fontSize: 11 }}>Signal quality</span>
                                <span style={{
                                  fontFamily: 'Outfit', fontSize: 10, fontWeight: 700,
                                  color: stab.color,
                                }}>
                                  {stab.text}
                                </span>
                              </div>
                              <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45 }}>
                                {expl.isHighVolatility
                                  ? `This channel shows high month-to-month variance (volatility score: ${(expl.volatilityScore * 100).toFixed(0)}%). The model applies extra smoothing here.`
                                  : expl.stabilityScore >= 0.7
                                  ? `Performance is consistent across observed periods. Signal reliability is high.`
                                  : `Performance shows some variation across months, but within normal range.`}
                              </p>
                            </>
                          )}
                        </div>

                        {/* Timing + Assessment */}
                        <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: `1px solid ${st.color}22` }}>
                          <p style={{ ...T.overline, fontSize: 9, marginBottom: 10 }}>Assessment</p>
                          <p style={{ ...T.body, fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                            {d?.explanation}
                          </p>
                          {expl && (expl.seasonalityStrength !== 'weak' || expl.dowEffectStrength !== 'weak') && (
                            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                              <p style={{ ...T.label, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Clock size={10} /> Timing note
                              </p>
                              <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45 }}>
                                {expl.seasonalityStrength !== 'weak'
                                  ? `Peak month is ${MONTH_NAMES[expl.peakMonth]} (+${Math.round(expl.peakBoost * 100)}% above annual average). `
                                  : ''}
                                {expl.dowEffectStrength !== 'weak'
                                  ? `Day-of-week effects are ${expl.dowEffectStrength}.`
                                  : ''}
                              </p>
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
        </div>
      )}

      {/* ── D. Allocation Pressure ────────────────────────────────────────── */}
      {(overWeightedChannels.length > 0 || underWeightedChannels.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Over-weighted */}
          <div style={{ ...CARD, borderColor: 'rgba(251,191,36,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={13} color="#FBBF24" />
              <p style={{ ...T.overline, color: '#FBBF24' }}>Over-Weighted</p>
            </div>
            {overWeightedChannels.length === 0 ? (
              <p style={{ ...T.body, fontSize: 12, fontStyle: 'italic' }}>None — no channels exceed their historical efficiency range.</p>
            ) : (
              overWeightedChannels.map(ch => {
                const d = diagnosis[ch];
                const row = currentPlan.channels[ch];
                return (
                  <div key={ch} style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }} />
                      <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: '#FBBF24' }}>
                        +{Math.abs(d?.deltaPct || 0).toFixed(0)}% vs hist.
                      </span>
                    </div>
                    <p style={{ ...T.body, fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
                      {(row?.allocationPct || 0).toFixed(1)}% allocated · ROAS {(d?.historicalROAS || 0).toFixed(2)}x
                      {d?.isSaturated ? ' · Saturation detected' : ''}
                    </p>
                    <p style={{ ...T.body, fontSize: 11, marginTop: 3, color: '#FBBF24', lineHeight: 1.4 }}>
                      Implication: continued spend increase is likely to see diminishing returns.
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Under-invested */}
          <div style={{ ...CARD, borderColor: 'rgba(96,165,250,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <TrendingUp size={13} color="#60A5FA" />
              <p style={{ ...T.overline, color: '#60A5FA' }}>Under-Invested</p>
            </div>
            {underWeightedChannels.length === 0 ? (
              <p style={{ ...T.body, fontSize: 12, fontStyle: 'italic' }}>None — all efficient channels are well-funded.</p>
            ) : (
              underWeightedChannels.map(ch => {
                const d = diagnosis[ch];
                const row = currentPlan.channels[ch];
                return (
                  <div key={ch} style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }} />
                      <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: '#60A5FA' }}>
                        {(d?.deltaPct || 0).toFixed(0)}% vs hist.
                      </span>
                    </div>
                    <p style={{ ...T.body, fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
                      {(row?.allocationPct || 0).toFixed(1)}% allocated · ROAS {(d?.historicalROAS || 0).toFixed(2)}x
                    </p>
                    <p style={{ ...T.body, fontSize: 11, marginTop: 3, color: '#60A5FA', lineHeight: 1.4 }}>
                      Opportunity: marginal return may still be strong at higher spend levels.
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── E. Diagnosis Matrix ───────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>

        {/* Toolbar — tight, single line */}
        <div style={{
          padding: '14px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ ...T.overline, fontSize: 10 }}>Full channel matrix</p>
          <p style={{ ...T.body, fontSize: 11, color: 'var(--text-muted)' }}>
            {sortedChannels.length} channels · click a row for detail
          </p>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '18px minmax(140px,2fr) 120px 100px 130px 90px 1fr',
          padding: '8px 22px', gap: 10,
          backgroundColor: 'var(--bg-root)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {['', 'Channel', 'Health', 'Efficiency', 'Spend Pressure', 'Stability', 'Why Flagged'].map((h, i) => (
            <span key={i} style={{ ...T.overline, fontSize: 9, textAlign: i <= 1 ? 'left' : 'center' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {sortedChannels.map(ch => {
          const color   = CHANNEL_COLORS[CHANNELS.indexOf(ch) % CHANNEL_COLORS.length];
          const d       = diagnosis[ch];
          const row     = currentPlan.channels[ch];
          const expl    = explanation[ch];
          const status  = (d?.status || 'efficient') as StatusKey;
          const st      = STATUS_META[status];
          const isOpen  = expandedRows.has(ch);
          const isFlagged = d?.isFlagged ?? false;

          const eff   = expl ? efficiencyLabel(expl.efficiencyConfidence) : { text: '—', color: 'var(--text-muted)' };
          const stab  = expl ? stabilityLabel(expl.isHighVolatility, expl.stabilityScore) : { text: '—', color: 'var(--text-muted)' };
          const press = spendPressureLabel(!!d?.isOverWeighted, !!d?.isUnderWeighted, !!d?.isSaturated);

          return (
            <div key={ch} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => toggleRow(ch)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '18px minmax(140px,2fr) 120px 100px 130px 90px 1fr',
                  padding: '11px 22px', gap: 10, alignItems: 'center',
                  width: '100%', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left', transition: '80ms',
                }}
              >
                {/* Chevron */}
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>

                {/* Channel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <ChannelName channel={ch} style={{
                    fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600,
                    color: 'var(--text-primary)',
                  }} />
                </div>

                {/* Health pill */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={badgeStyle(st.color)}>
                    <span style={dotStyle(st.color)} />
                    {st.label}
                  </span>
                </div>

                {/* Efficiency */}
                <p style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: eff.color, margin: 0, textAlign: 'center' }}>
                  {eff.text}
                </p>

                {/* Spend Pressure */}
                <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: press.color, margin: 0, textAlign: 'center', lineHeight: 1.3 }}>
                  {press.text}
                </p>

                {/* Stability */}
                <p style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: stab.color, margin: 0, textAlign: 'center' }}>
                  {stab.text}
                </p>

                {/* Why Flagged */}
                <p style={{ ...T.body, fontSize: 11, color: isFlagged ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.35 }}>
                  {isFlagged ? d?.reasonCode : '—'}
                </p>
              </button>

              {/* Expanded row detail */}
              {isOpen && (
                <div style={{
                  padding: '0 22px 16px',
                  borderTop: `1px solid ${st.color}18`,
                  backgroundColor: 'var(--bg-root)',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>

                    {/* Performance Signal */}
                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 9 }}>Performance Signal</p>
                      {expl ? [
                        { k: 'Tuned ROAS', v: `${expl.tunedROAS.toFixed(2)}x` },
                        { k: 'Blended',    v: `${expl.portfolioROAS.toFixed(2)}x` },
                        { k: 'Confidence', v: `${Math.round(expl.efficiencyConfidence * 100)}%` },
                      ].map(({ k, v }) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                          <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                        </div>
                      )) : <p style={T.body}>No data</p>}
                    </div>

                    {/* Spend & Saturation */}
                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 9 }}>Spend & Saturation</p>
                      {d && [
                        { k: 'Allocation', v: `${(row?.allocationPct || 0).toFixed(1)}%` },
                        { k: 'Historical', v: `${Math.round((historicalFractions[ch] || 0) * 100)}%` },
                        { k: 'Current spend', v: formatINRCompact(d.currentSpend) },
                        {
                          k: 'Efficient range',
                          v: `${formatINRCompact(d.lowerEfficientSpend)} - ${Number.isFinite(d.upperEfficientSpend) ? formatINRCompact(d.upperEfficientSpend) : 'Open-ended'}`,
                        },
                        {
                          k: 'Saturation threshold',
                          v: Number.isFinite(d.saturationSpend) ? formatINRCompact(d.saturationSpend) : 'Not reached in observed range',
                        },
                        { k: 'Marginal ROAS', v: `${(row?.marginalROAS || 0).toFixed(2)}x` },
                      ].map(({ k, v }) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', gap: 8 }}>
                          <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                          <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{v}</span>
                        </div>
                      ))}
                      {expl?.isSaturated && (
                        <p style={{ ...T.body, fontSize: 10, color: '#F87171', marginTop: 6, lineHeight: 1.4 }}>
                          Saturation detected — further spend has limited marginal return.
                        </p>
                      )}
                    </div>

                    {/* Analyst note */}
                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: 9, border: `1px solid ${st.color}22` }}>
                      <p style={{ ...T.overline, fontSize: 9, marginBottom: 9 }}>Assessment</p>
                      <p style={{ ...T.body, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                        {d?.explanation || `${ch} is operating within a normal efficiency range relative to the blended median.`}
                      </p>
                      {isFlagged && d?.reasonCode && (
                        <span style={{ ...badgeStyle(st.color), marginTop: 9 }}>
                          {d.reasonCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── F. Opportunity Summary ────────────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <p style={{ ...T.overline, marginBottom: 18 }}>Opportunity Summary</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>

          {/* Strongest positions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <CheckCircle2 size={12} color="#34D399" />
              <p style={{ ...T.label, color: '#34D399' }}>Strongest current positions</p>
            </div>
            {topChannels.map(ch => {
              const expl = explanation[ch];
              const row  = currentPlan.channels[ch];
              return (
                <div key={ch} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} />
                    <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: '#34D399' }}>
                      {(expl?.tunedROAS ?? row?.roas ?? 0).toFixed(2)}x
                    </span>
                  </div>
                  <p style={{ ...T.body, fontSize: 11, marginTop: 2 }}>
                    {(row?.allocationPct || 0).toFixed(1)}% allocated · {formatINRCompact(row?.periodRevenue || 0)} forecast
                  </p>
                  <p style={{ ...T.body, fontSize: 10, marginTop: 2 }}>
                    Tuned ROAS signal: {(expl?.tunedROAS ?? row?.roas ?? 0).toFixed(2)}x
                  </p>
                </div>
              );
            })}
          </div>

          {/* Main inefficiency sources */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <ShieldAlert size={12} color="#FBBF24" />
              <p style={{ ...T.label, color: '#FBBF24' }}>Main inefficiency sources</p>
            </div>
            {flaggedChannels.length === 0 ? (
              <p style={{ ...T.body, fontSize: 12 }}>No significant inefficiencies detected in the current mix.</p>
            ) : (
              flaggedChannels.map(ch => {
                const d = diagnosis[ch];
                const status = (d?.status || 'efficient') as StatusKey;
                const st = STATUS_META[status];
                return (
                  <div key={ch} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} />
                      <span style={badgeStyle(st.color)}>
                        <span style={dotStyle(st.color)} />
                        {st.label}
                      </span>
                    </div>
                    <p style={{ ...T.body, fontSize: 11, marginTop: 2 }}>{d?.reasonCode}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Directional takeaway */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Minus size={12} color="var(--text-muted)" />
              <p style={{ ...T.label }}>Directional takeaway</p>
            </div>
            <p style={{ ...T.body, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {takeaway}
            </p>
            <p style={{ ...T.body, fontSize: 11, marginTop: 10, fontStyle: 'italic', lineHeight: 1.45 }}>
              The Recommended Mix page will show how the model would reallocate this budget and the forecast improvement.
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
            Diagnosis complete. Ready to see the recommended reallocation?
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 5 }}>
            The next step shows how the model would redistribute this budget across channels, with per-channel rationale and forecast uplift.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <Link
            to="/optimizer/current-mix"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 15px', borderRadius: 9,
              border: '1px solid var(--border-strong)',
              backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)',
              fontFamily: 'Outfit', fontSize: 12, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={13} /> Back to Current Mix
          </Link>
          <Link
            to="/optimizer/recommended"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 9,
              background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
              color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
              textDecoration: 'none', whiteSpace: 'nowrap' as const,
            }}
          >
            See Recommended Mix <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

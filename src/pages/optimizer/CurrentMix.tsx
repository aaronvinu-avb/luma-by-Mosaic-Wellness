/**
 * CurrentMix — Page 1 of Mix Optimiser
 *
 * ARCHITECTURE NOTE — two allocation state layers:
 *   localAllocs  — live drag values, updated on every slider move (display only)
 *   context.allocations — committed values, updated on drag END (triggers model recompute)
 *
 * This ensures:
 *  - sliders feel immediate and smooth
 *  - forecast values / health badges only update when the user releases the thumb
 *  - row sort order is stable during drag (keyed to committed diagnosis)
 *
 * DATA CONTRACT — reads from model (committed state only):
 *   currentPlan, historicalFractions, diagnosis, flaggedChannels,
 *   durationMonths, monthlyBudget, totalPeriodBudget,
 *   explanation, dataRange, dataSource, dataUpdatedAt, totalHistoricalMonths
 *
 * Must NOT read: optimizedPlan, uplift, recommendations, scenarios
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { OptimizerSubnav } from '@/components/optimizer/OptimizerSubnav';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { useOptimizer } from '@/contexts/OptimizerContext';
import { formatINR, formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  ChevronRight, ChevronDown, ArrowRight, SlidersHorizontal,
  RotateCcw, TrendingUp, TrendingDown, Minus, Activity, Scale,
} from 'lucide-react';
import type { PlanningPeriod, PlanningMode } from '@/contexts/OptimizerContext';

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
  label: {
    fontFamily: 'Outfit' as const, fontSize: 11, fontWeight: 600 as const,
    color: 'var(--text-muted)', margin: 0,
  },
  num: {
    fontFamily: 'Outfit' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
};

const CARD: React.CSSProperties = {
  padding: '20px 24px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 14,
  backgroundColor: 'var(--bg-card)',
};

// Column grid template — identical in header and rows to lock alignment
const COL = '20px minmax(140px,1fr) 72px 90px 90px 52px 104px';

// Health label mapping (plain English)
const STATUS_META = {
  efficient:      { label: 'On Track',      color: '#34D399', bg: 'rgba(52,211,153,0.11)'  },
  saturated:      { label: 'Saturated',     color: '#F87171', bg: 'rgba(248,113,113,0.11)' },
  'over-scaled':  { label: 'Over-weighted', color: '#FBBF24', bg: 'rgba(251,191,36,0.11)'  },
  'under-scaled': { label: 'Under-invested',color: '#60A5FA', bg: 'rgba(96,165,250,0.11)'  },
} as const;

// Sort priority: worst health first
const STATUS_ORDER: Record<string, number> = {
  saturated: 0, 'over-scaled': 1, 'under-scaled': 2, efficient: 3,
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 0.70) return { text: 'Strong signal',   color: '#34D399' };
  if (score >= 0.38) return { text: 'Moderate signal', color: '#FBBF24' };
  return               { text: 'Thin data',           color: '#94a3b8' };
}

// Timeline months for the custom date picker
const TIMELINE_MONTHS = (() => {
  const s = 2023, e = 2027;
  return Array.from({ length: (e - s + 1) * 12 }, (_, i) => {
    const y = s + Math.floor(i / 12), mo = i % 12;
    return { key: `${y}-${String(mo + 1).padStart(2, '0')}`, year: y, month: mo };
  });
})();

// ── Component ─────────────────────────────────────────────────────────────────

export default function CurrentMix() {
  // ── Committed model outputs ─────────────────────────────────────────────────
  const {
    isLoading, dataSource, dataUpdatedAt, dataRange, totalHistoricalMonths,
    currentPlan, historicalFractions, diagnosis, flaggedChannels,
    durationMonths, monthlyBudget, totalPeriodBudget,
    explanation,
  } = useOptimizerModel();

  // ── Context — writeable planning inputs ────────────────────────────────────
  const {
    budget, setBudget,
    planningPeriod, setPlanningPeriod,
    planningMode, setPlanningMode,
    customStartMonth, setCustomStartMonth,
    customEndMonth, setCustomEndMonth,
    allocations, setAllocations,
    paused, setPaused,
  } = useOptimizer();

  // ── Live drag state (display only; does NOT trigger model recompute) ────────
  const [localAllocs, setLocalAllocs] = useState<Record<string, number>>(() => ({ ...allocations }));

  // Sync localAllocs when context changes from outside (reset, init, etc.)
  // Only when not actively dragging (we use a drag-in-progress flag below)
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (!isDragging) setLocalAllocs({ ...allocations });
  }, [allocations, isDragging]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);

  const toggleRow = useCallback((ch: string) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; }),
  []);

  // ── Stable row sort — keyed to committed diagnosis, not live drag ────────────
  const sortedChannels = useMemo(() =>
    [...CHANNELS].sort((a, b) => {
      const sa = STATUS_ORDER[diagnosis[a]?.status ?? 'efficient'] ?? 3;
      const sb = STATUS_ORDER[diagnosis[b]?.status ?? 'efficient'] ?? 3;
      if (sa !== sb) return sa - sb;
      return (currentPlan.channels[b]?.periodRevenue || 0) - (currentPlan.channels[a]?.periodRevenue || 0);
    }),
  [diagnosis, currentPlan]);

  // ── Allocation totals ───────────────────────────────────────────────────────
  const localTotal     = Object.values(localAllocs).reduce((s, v) => s + v, 0);
  const localTotalPct  = Math.round(localTotal * 100);
  const allocOk        = Math.abs(localTotal - 1) < 0.015;
  const allocNeedsWork = !allocOk;
  const remaining      = Math.round((1 - localTotal) * 100); // positive = under, negative = over

  // ── Allocation action helpers ───────────────────────────────────────────────
  const resetToHistorical = useCallback(() => {
    setLocalAllocs({ ...historicalFractions });
    setAllocations({ ...historicalFractions });
  }, [historicalFractions, setAllocations]);

  const normalizeAllocs = useCallback(() => {
    if (localTotal === 0) return;
    const normalized = Object.fromEntries(
      Object.entries(localAllocs).map(([ch, v]) => [ch, v / localTotal])
    );
    setLocalAllocs(normalized);
    setAllocations(normalized);
  }, [localAllocs, localTotal, setAllocations]);

  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : 5_000_000;

  // ── Diagnosis summary helpers ───────────────────────────────────────────────
  const efficientCount = CHANNELS.filter(ch => !diagnosis[ch]?.isFlagged).length;
  const topChannels = useMemo(() =>
    [...CHANNELS]
      .filter(ch => explanation[ch])
      .sort((a, b) => (explanation[b]?.tunedROAS || 0) - (explanation[a]?.tunedROAS || 0))
      .slice(0, 3),
  [explanation]);

  if (isLoading) return <DashboardSkeleton />;

  // ── Allocation progress bar values ─────────────────────────────────────────
  const barColor = allocOk ? '#34D399' : Math.abs(localTotal - 1) < 0.08 ? '#FBBF24' : '#F87171';
  const barWidth  = Math.min(localTotalPct, 110); // cap visual at 110% to avoid overflow

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 26 }}>
      <OptimizerSubnav />

      {/* ── A. Page Header ──────────────────────────────────────────────────── */}
      <div>
        <h1 style={{
          fontFamily: 'Outfit', fontSize: 28, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0,
        }}>
          Current Mix
        </h1>
        <p style={{ ...T.body, marginTop: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
          Review your current allocation and modeled performance before exploring recommendations.
        </p>
        <p style={{ ...T.body, fontSize: 12, marginTop: 4, color: 'var(--text-muted)' }}>
          Forecast uses tuned historical signals, diminishing returns, and timing effects
          {dataRange ? ` · Data: ${dataRange.min} → ${dataRange.max}` : ''}
          {` · ${Math.round(totalHistoricalMonths)} months history`}
          {` · ${dataSource === 'api' ? 'Live API' : dataSource === 'cached' ? 'Cache' : 'Sample data'}`}
          {dataUpdatedAt ? ` · Updated ${new Date(dataUpdatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </p>
      </div>

      {/* ── B. Controls Strip ───────────────────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <p style={{ ...T.overline, marginBottom: 18 }}>Planning settings</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, alignItems: 'start' }}>

          {/* Monthly Budget */}
          <div>
            <p style={{ ...T.label, marginBottom: 8 }}>Monthly Budget</p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: 'var(--bg-root)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10, padding: '10px 14px',
            }}>
              <span style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
              <input
                type="number" value={safeBudget} min={0} step={1000}
                onChange={e => { const v = Number(e.target.value); setBudget(Number.isFinite(v) ? Math.max(0, v) : 0); }}
                onBlur={() => setBudget(b => Math.round(Math.max(0, b) / 1000) * 1000)}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
                  color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
            <p style={{ ...T.body, fontSize: 11, marginTop: 5 }}>
              {formatINR(safeBudget)}/mo · {formatINRCompact(totalPeriodBudget)} total
            </p>
          </div>

          {/* Planning Period */}
          <div>
            <p style={{ ...T.label, marginBottom: 8 }}>Planning Period</p>
            <select
              value={planningPeriod}
              onChange={e => setPlanningPeriod(e.target.value as PlanningPeriod)}
              style={{
                width: '100%', backgroundColor: 'var(--bg-root)',
                border: '1px solid var(--border-strong)', borderRadius: 10,
                color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans',
                fontSize: 13, padding: '11px 14px', outline: 'none',
              }}
            >
              <option value="1m">1 Month</option>
              <option value="1q">1 Quarter (3 months)</option>
              <option value="6m">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="custom">Custom range</option>
            </select>
            {planningPeriod === 'custom' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <select value={customStartMonth} onChange={e => setCustomStartMonth(e.target.value)}
                  style={{ flex: 1, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 11, padding: '7px 8px', outline: 'none' }}>
                  {TIMELINE_MONTHS.map(m => <option key={m.key} value={m.key}>{MONTH_NAMES[m.month]} {m.year}</option>)}
                </select>
                <span style={{ ...T.overline, fontSize: 9 }}>to</span>
                <select value={customEndMonth} onChange={e => setCustomEndMonth(e.target.value)}
                  style={{ flex: 1, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 11, padding: '7px 8px', outline: 'none' }}>
                  {TIMELINE_MONTHS.map(m => <option key={m.key} value={m.key}>{MONTH_NAMES[m.month]} {m.year}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Planning Mode */}
          <div>
            <p style={{ ...T.label, marginBottom: 8 }}>Planning Mode</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['conservative', 'target', 'aggressive'] as PlanningMode[]).map(m => (
                <button key={m} onClick={() => setPlanningMode(m)} style={{
                  fontFamily: 'Outfit', fontSize: 12, fontWeight: 600,
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer', transition: '120ms',
                  border: planningMode === m ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                  backgroundColor: planningMode === m ? 'var(--bg-root)' : 'transparent',
                  color: planningMode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <p style={{ ...T.body, fontSize: 11, marginTop: 6 }}>
              {planningMode === 'conservative' ? '0.8× revenue multiplier — downside scenario.' :
               planningMode === 'aggressive'   ? '1.2× revenue multiplier — upside scenario.' :
               '1.0× multiplier — baseline forecast.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── C. KPI Strip ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          {
            label: 'Revenue Forecast',
            value: formatINRCompact(currentPlan.totalPeriodRevenue),
            sub: 'Modeled from current allocation',
            accent: '#60A5FA',
          },
          {
            label: 'Blended ROAS',
            value: `${currentPlan.blendedROAS.toFixed(2)}x`,
            sub: 'Weighted return across the current mix',
            accent: '#E8803A',
          },
          {
            label: 'Monthly Budget',
            value: formatINRCompact(monthlyBudget),
            sub: `${durationMonths} month${durationMonths > 1 ? 's' : ''} · ${formatINRCompact(totalPeriodBudget)} total`,
            accent: '#A78BFA',
          },
          {
            label: 'Channels to Review',
            value: flaggedChannels.length === 0 ? 'All healthy' : `${flaggedChannels.length} / 10`,
            sub: flaggedChannels.length === 0
              ? 'All channels are within efficient range'
              : `${flaggedChannels.slice(0, 2).join(', ')}${flaggedChannels.length > 2 ? ` +${flaggedChannels.length - 2} more` : ''} flagged`,
            accent: flaggedChannels.length === 0 ? '#34D399' : '#FBBF24',
          },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...CARD, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
            <p style={{ ...T.overline, fontSize: 9 }}>{kpi.label}</p>
            <p style={{
              ...T.num, fontWeight: 800, fontSize: 24,
              color: 'var(--text-primary)', letterSpacing: '-0.025em',
              margin: '8px 0 5px',
            }}>
              {kpi.value}
            </p>
            <p style={{ ...T.body, fontSize: 11, lineHeight: 1.45, flex: 1 }}>{kpi.sub}</p>
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: 12, opacity: 0.35 }} />
          </div>
        ))}
      </div>

      {/* ── D. Allocation Table ──────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>

        {/* Table toolbar */}
        <div style={{
          padding: '16px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <p style={{ ...T.overline, fontSize: 10, marginBottom: 3 }}>Channel Allocation</p>
            <p style={{ ...T.body, fontSize: 12 }}>
              {editMode
                ? 'Drag sliders to adjust — forecast updates on release.'
                : 'Click a row to view channel details. Toggle edit to adjust allocations.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={resetToHistorical}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'Outfit', fontSize: 11, fontWeight: 600,
                padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'transparent', color: 'var(--text-muted)',
              }}
            >
              <RotateCcw size={11} /> Reset
            </button>
            <button
              onClick={() => setEditMode(e => !e)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'Outfit', fontSize: 11, fontWeight: 600,
                padding: '6px 11px', borderRadius: 7, cursor: 'pointer', transition: '120ms',
                border: editMode ? '1px solid rgba(232,128,58,0.5)' : '1px solid var(--border-subtle)',
                backgroundColor: editMode ? 'rgba(232,128,58,0.08)' : 'transparent',
                color: editMode ? '#E8803A' : 'var(--text-muted)',
              }}
            >
              <SlidersHorizontal size={11} /> {editMode ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: COL,
          padding: '8px 22px', gap: 8,
          backgroundColor: 'var(--bg-root)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {[
            { h: '',                align: 'left'   },
            { h: 'Channel',         align: 'left'   },
            { h: 'Allocation',      align: 'right'  },
            { h: 'Forecast Spend',  align: 'right'  },
            { h: 'Forecast Revenue',align: 'right'  },
            { h: 'ROAS',            align: 'center' },
            { h: 'Health',          align: 'center' },
          ].map(({ h, align }, i) => (
            <span key={i} style={{ ...T.overline, fontSize: 9, textAlign: align as React.CSSProperties['textAlign'] }}>{h}</span>
          ))}
        </div>

        {/* ── Rows ─────────────────────────────────────────────────────────── */}
        {sortedChannels.map(ch => {
          const color    = CHANNEL_COLORS[CHANNELS.indexOf(ch) % CHANNEL_COLORS.length];
          // Committed model values — stable, only update on drag commit
          const row      = currentPlan.channels[ch];
          const diag     = diagnosis[ch];
          const expl     = explanation[ch];
          const status   = (diag?.status || 'efficient') as keyof typeof STATUS_META;
          const st       = STATUS_META[status];
          const isFlagged  = diag?.isFlagged ?? false;
          const isPaused   = paused.has(ch);
          const isExpanded = expandedRows.has(ch);

          // Committed forecast values
          const spend   = row?.periodSpend  ?? 0;
          const revenue = row?.periodRevenue ?? 0;
          const roas    = row?.roas          ?? 0;
          const marg    = row?.marginalROAS  ?? 0;
          const margDir = marg >= (roas * 0.9) ? 'healthy' : marg >= 1.0 ? 'weakening' : 'below-breakeven';
          const conf    = expl ? confidenceLabel(expl.efficiencyConfidence) : { text: '', color: 'var(--text-muted)' };

          // Live drag value (from localAllocs, not committed model)
          const livePct  = Math.round((localAllocs[ch] || 0) * 100);
          const histPct  = Math.round((historicalFractions[ch] || 0) * 100);
          // Committed allocation % from model (for display in read mode)
          const readPct  = (row?.allocationPct ?? 0).toFixed(1);

          return (
            <div
              key={ch}
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                opacity: isPaused ? 0.45 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {/* ── Main data row ──────────────────────────────────────────── */}
              <div
                onClick={() => !editMode && toggleRow(ch)}
                style={{
                  display: 'grid', gridTemplateColumns: COL,
                  padding: '13px 22px', gap: 8, alignItems: 'center',
                  cursor: editMode ? 'default' : 'pointer',
                  userSelect: 'none',
                }}
              >
                {/* Chevron */}
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!editMode && (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
                </span>

                {/* Channel identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <ChannelName channel={ch} style={{
                      fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600,
                      color: 'var(--text-primary)', display: 'block',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} />
                    {isFlagged && (
                      <span style={{
                        fontFamily: 'Outfit', fontSize: 9, fontWeight: 600,
                        color: st.color, letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>
                        {diag?.reasonCode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Allocation % — shows live value in edit mode, committed in read mode */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ ...T.num, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {editMode ? `${livePct}%` : `${readPct}%`}
                  </p>
                  <p style={{ ...T.num, fontSize: 10, color: 'var(--text-muted)', margin: '1px 0 0' }}>
                    hist. {histPct}%
                  </p>
                </div>

                {/* Forecast Spend — committed value, stable during drag */}
                <p style={{ ...T.num, fontSize: 12, color: 'var(--text-secondary)', margin: 0, textAlign: 'right' }}>
                  {formatINRCompact(spend)}
                </p>

                {/* Forecast Revenue — committed value, stable during drag */}
                <p style={{ ...T.num, fontSize: 12, fontWeight: 700, color, margin: 0, textAlign: 'right' }}>
                  {formatINRCompact(revenue)}
                </p>

                {/* ROAS — committed value */}
                <p style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: 0, textAlign: 'center' }}>
                  {roas.toFixed(2)}x
                </p>

                {/* Health badge — from committed diagnosis, stable during drag */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{
                    fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                    color: st.color, backgroundColor: st.bg,
                    padding: '4px 9px', borderRadius: 5,
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                </div>
              </div>

              {/* ── Edit mode: slider row ──────────────────────────────────── */}
              {editMode && (
                <div style={{
                  padding: '2px 22px 12px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  borderTop: `1px solid var(--border-subtle)`,
                }}>
                  {/* Active/paused toggle */}
                  <Switch
                    checked={!isPaused}
                    onCheckedChange={() => setPaused(prev => {
                      const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n;
                    })}
                  />

                  {/* Allocation mini-label */}
                  <span style={{ ...T.num, fontSize: 11, color: 'var(--text-muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>
                    {livePct}%
                  </span>

                  {/* Slider */}
                  <div style={{ flex: 1 }}>
                    <Slider
                      value={[livePct]}
                      min={0} max={60} step={1}
                      disabled={isPaused}
                      onValueChange={([v]) => {
                        setIsDragging(true);
                        setLocalAllocs(prev => ({ ...prev, [ch]: v / 100 }));
                      }}
                      onValueCommit={([v]) => {
                        setIsDragging(false);
                        setLocalAllocs(prev => ({ ...prev, [ch]: v / 100 }));
                        setAllocations(prev => ({ ...prev, [ch]: v / 100 }));
                      }}
                    />
                  </div>

                  {/* Historical hint */}
                  <span style={{ ...T.body, fontSize: 10, color: 'var(--text-muted)', width: 48, textAlign: 'right', flexShrink: 0 }}>
                    hist. {histPct}%
                  </span>
                </div>
              )}

              {/* ── Expanded detail panel (read mode only) ────────────────── */}
              {isExpanded && !editMode && (
                <div style={{
                  padding: '4px 22px 18px',
                  borderTop: `1px solid ${st.color}1E`,
                  backgroundColor: 'var(--bg-root)',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>

                    {/* Modeled Outlook */}
                    <div style={{ padding: '13px 15px', backgroundColor: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, marginBottom: 11 }}>Modeled Outlook</p>
                      {[
                        { k: 'Monthly spend',  v: formatINRCompact(row?.spend ?? 0) },
                        { k: 'Period revenue', v: formatINRCompact(revenue) },
                        { k: 'Effective ROAS', v: `${roas.toFixed(2)}x` },
                        { k: 'Marginal ROAS',  v: `${marg.toFixed(2)}x` },
                      ].map(({ k, v }) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                          <span style={{ ...T.body, fontSize: 12 }}>{k}</span>
                          <span style={{ ...T.num, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                        </div>
                      ))}
                      <p style={{ ...T.body, fontSize: 11, lineHeight: 1.5, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 6 }}>
                        {margDir === 'below-breakeven'
                          ? 'Each additional ₹1 spent is returning less than ₹1 — marginal returns are below breakeven.'
                          : margDir === 'weakening'
                          ? `Marginal return (${marg.toFixed(2)}x) is below channel average — efficiency is declining at this spend level.`
                          : `Marginal return (${marg.toFixed(2)}x) is healthy — further spend should remain productive.`}
                      </p>
                    </div>

                    {/* Performance Signal */}
                    <div style={{ padding: '13px 15px', backgroundColor: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, marginBottom: 11 }}>Performance Signal</p>
                      {expl ? (
                        <>
                          {[
                            { k: 'Tuned ROAS',       v: `${expl.tunedROAS.toFixed(2)}x` },
                            { k: 'Portfolio median', v: `${expl.portfolioROAS.toFixed(2)}x` },
                            {
                              k: 'vs portfolio',
                              v: expl.tunedROAS > expl.portfolioROAS * 1.1
                                ? `+${Math.round((expl.tunedROAS / expl.portfolioROAS - 1) * 100)}% above`
                                : expl.tunedROAS < expl.portfolioROAS * 0.9
                                ? `${Math.round((1 - expl.tunedROAS / expl.portfolioROAS) * 100)}% below`
                                : 'In line',
                            },
                          ].map(({ k, v }) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                              <span style={{ ...T.body, fontSize: 12 }}>{k}</span>
                              <span style={{ ...T.num, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                            </div>
                          ))}
                          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ ...T.body, fontSize: 12 }}>Data quality</span>
                              <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: conf.color }}>{conf.text}</span>
                            </div>
                            {expl.isHighVolatility && (
                              <p style={{ ...T.body, fontSize: 11, lineHeight: 1.4, color: '#FBBF24' }}>
                                High month-to-month variance. The model moderates outliers before scoring.
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p style={{ ...T.body, fontSize: 12 }}>No performance data available.</p>
                      )}
                    </div>

                    {/* Timing Effects */}
                    <div style={{ padding: '13px 15px', backgroundColor: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                      <p style={{ ...T.overline, marginBottom: 11 }}>Timing Effects</p>
                      {expl ? (() => {
                        const hasSeason = expl.seasonalityStrength !== 'weak';
                        const hasDow    = expl.dowEffectStrength   !== 'weak';
                        if (!hasSeason && !hasDow)
                          return <p style={{ ...T.body, fontSize: 12 }}>No significant timing patterns detected. Timing adjustments are minimal.</p>;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {hasSeason && (
                              <div>
                                <p style={{ ...T.label, marginBottom: 4 }}>Seasonality</p>
                                <p style={{ ...T.body, fontSize: 12, lineHeight: 1.5 }}>
                                  <strong style={{ color: 'var(--text-primary)', fontFamily: 'Outfit' }}>{MONTH_NAMES[expl.peakMonth]}</strong>
                                  {` is the peak month (+${Math.round(expl.peakBoost * 100)}% above annual average). `}
                                  <span style={{ color: expl.seasonalityStrength === 'strong' ? '#34D399' : '#FBBF24' }}>
                                    {expl.seasonalityStrength} signal.
                                  </span>
                                </p>
                              </div>
                            )}
                            {hasDow && (
                              <div>
                                <p style={{ ...T.label, marginBottom: 4 }}>Day of week</p>
                                <p style={{ ...T.body, fontSize: 12, lineHeight: 1.5 }}>
                                  Best day: <strong style={{ color: 'var(--text-primary)', fontFamily: 'Outfit' }}>{DOW_NAMES[expl.bestDay]}</strong>
                                  {` (+${Math.round((expl.dowIndex[expl.bestDay] - 1) * 100)}% above weekly average).`}
                                  {expl.weekendBias !== 'neutral' ? ` Performs better on ${expl.weekendBias === 'weekend' ? 'weekends' : 'weekdays'}.` : ''}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <p style={{ ...T.body, fontSize: 12 }}>Timing data not available.</p>
                      )}
                    </div>

                    {/* Assessment */}
                    <div style={{ padding: '13px 15px', backgroundColor: 'var(--bg-card)', borderRadius: 10, border: `1px solid ${st.color}2E` }}>
                      <p style={{ ...T.overline, marginBottom: 9 }}>Assessment</p>
                      <p style={{ ...T.body, fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                        {diag?.explanation || `${ch} appears to be operating within a normal efficiency range.`}
                      </p>
                      {diag?.reasonCode && diag.reasonCode !== 'Efficient allocation' && (
                        <span style={{
                          display: 'inline-block', marginTop: 10,
                          fontFamily: 'Outfit', fontSize: 9, fontWeight: 700,
                          color: st.color, backgroundColor: st.bg,
                          padding: '3px 9px', borderRadius: 4,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          {diag.reasonCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Allocation Total Bar ─────────────────────────────────────────── */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-root)',
        }}>
          {/* Label row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...T.overline, fontSize: 9 }}>Total allocation</span>
              <span style={{
                ...T.num, fontSize: 14, fontWeight: 800,
                color: barColor, letterSpacing: '-0.01em',
              }}>
                {localTotalPct}%
              </span>
              {allocNeedsWork && (
                <span style={{ ...T.body, fontSize: 11, color: 'var(--text-muted)' }}>
                  {remaining > 0
                    ? `${remaining}pp remaining to assign`
                    : `${Math.abs(remaining)}pp over budget`}
                </span>
              )}
              {allocOk && (
                <span style={{ ...T.body, fontSize: 11, color: '#34D399' }}>Allocation is valid</span>
              )}
            </div>

            {allocNeedsWork && editMode && (
              <button
                onClick={normalizeAllocs}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: 'Outfit', fontSize: 11, fontWeight: 600,
                  padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${barColor}55`,
                  backgroundColor: `${barColor}0E`,
                  color: barColor,
                }}
              >
                <Scale size={10} /> Normalize to 100%
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div style={{
            height: 4, borderRadius: 3,
            backgroundColor: 'var(--border-strong)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(barWidth, 100)}%`,
              backgroundColor: barColor,
              borderRadius: 3,
              transition: isDragging ? 'none' : 'width 200ms ease, background-color 200ms ease',
              opacity: 0.7,
            }} />
          </div>
        </div>
      </div>

      {/* ── E. Mix Assessment ────────────────────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <p style={{ ...T.overline, marginBottom: 18 }}>Mix Assessment</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>

          {/* Strongest channels */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <TrendingUp size={12} color="#34D399" />
              <p style={{ ...T.label, color: '#34D399' }}>Strongest channels</p>
            </div>
            {topChannels.map(ch => {
              const expl = explanation[ch];
              const row  = currentPlan.channels[ch];
              return (
                <div key={ch} style={{ paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} />
                    <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: '#34D399' }}>
                      {(expl?.tunedROAS ?? row?.roas ?? 0).toFixed(2)}x
                    </span>
                  </div>
                  <p style={{ ...T.body, fontSize: 11, marginTop: 2 }}>
                    {(row?.allocationPct ?? 0).toFixed(1)}% · {formatINRCompact(row?.periodRevenue ?? 0)} forecast
                  </p>
                </div>
              );
            })}
          </div>

          {/* Channels to review */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              {flaggedChannels.length > 0 ? <Activity size={12} color="#FBBF24" /> : <TrendingUp size={12} color="#34D399" />}
              <p style={{ ...T.label, color: flaggedChannels.length > 0 ? '#FBBF24' : '#34D399' }}>
                Channels to review
              </p>
            </div>
            {flaggedChannels.length === 0 ? (
              <p style={{ ...T.body, fontSize: 12 }}>No channels flagged. All are within efficient ranges.</p>
            ) : flaggedChannels.map(ch => {
              const d  = diagnosis[ch];
              const st = STATUS_META[(d?.status || 'efficient') as keyof typeof STATUS_META] ?? STATUS_META.efficient;
              return (
                <div key={ch} style={{ paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} />
                    <span style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: st.color, backgroundColor: st.bg, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' as const }}>
                      {st.label}
                    </span>
                  </div>
                  <p style={{ ...T.body, fontSize: 11, marginTop: 2 }}>{d?.reasonCode}</p>
                </div>
              );
            })}
          </div>

          {/* Takeaway */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Minus size={12} color="var(--text-muted)" />
              <p style={{ ...T.label }}>Strategic takeaway</p>
            </div>
            <p style={{ ...T.body, fontSize: 13, lineHeight: 1.7 }}>
              {'Your current mix is forecast to generate '}
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'Outfit' }}>
                {formatINRCompact(currentPlan.totalPeriodRevenue)}
              </strong>
              {' at a blended ROAS of '}
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'Outfit' }}>
                {currentPlan.blendedROAS.toFixed(2)}x
              </strong>
              {'. '}
              {efficientCount === CHANNELS.length
                ? `All ${CHANNELS.length} channels are operating within efficient ranges.`
                : flaggedChannels.length === 1
                ? `${CHANNELS.length - 1} channels look healthy; ${flaggedChannels[0]} needs attention.`
                : `${efficientCount} of ${CHANNELS.length} channels appear balanced. ${flaggedChannels.length} need review before moving to a recommendation.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── F. Next-step CTA ─────────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap' as const,
        borderColor: 'rgba(232,128,58,0.22)',
      }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Current state reviewed. Ready for the recommendation?
          </p>
          <p style={{ ...T.body, fontSize: 13, marginTop: 5 }}>
            The next step shows how the model would redistribute this budget to improve projected return.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <Link to="/optimizer/diagnosis" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 10,
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)',
            fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}>
            Open Diagnosis
          </Link>
          <Link to="/optimizer/recommended" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 20px', borderRadius: 10,
            background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
            color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
          }}>
            See Recommended Mix <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

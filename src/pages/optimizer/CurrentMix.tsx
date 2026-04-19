/**
 * CurrentMix — Page 1 of Mix Optimiser
 *
 * INTERACTION MODEL:
 *   Main table  = read-first analytical surface (no inline sliders)
 *   Edit drawer = focused right-panel that opens on "Adjust" click
 *
 * STATE LAYERS:
 *   allocations (context)  — committed state, drives model recompute
 *   pendingAllocs          — live drawer edits, committed only on Save
 *
 * DATA CONTRACT (current state only):
 *   currentPlan, historicalFractions, diagnosis, flaggedChannels,
 *   explanation, durationMonths, monthlyBudget, totalPeriodBudget,
 *   dataRange, dataSource, dataUpdatedAt, totalHistoricalMonths
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { useOptimizer, DEFAULT_MONTHLY_BUDGET } from '@/contexts/OptimizerContext';
import { formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { Slider } from '@/components/ui/slider';
import {
  ArrowRight, TrendingUp, Activity, Minus,
  X, RotateCcw, Scale, SlidersHorizontal,
} from 'lucide-react';
import type { PlanningPeriod, PlanningMode } from '@/contexts/OptimizerContext';
import {
  T, CARD, TABLE, badgeStyle, dotStyle,
  STATUS_META, STATUS_ORDER, type StatusKey,
} from './_shared/ui';

// Main table grid — 6 data columns + action
// Widths are tuned so uppercase column headers render on a single line
// and pill badges ("Over-Weighted", "Under-Invested") fit without squeezing.
const COL = 'minmax(180px,1.2fr) 86px 104px 116px 64px 130px 72px';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TIMELINE_MONTHS = (() => {
  const s = 2023, e = 2027;
  return Array.from({ length: (e - s + 1) * 12 }, (_, i) => {
    const y = s + Math.floor(i / 12), mo = i % 12;
    return { key: `${y}-${String(mo + 1).padStart(2, '0')}`, year: y, month: mo };
  });
})();

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 0.70) return { text: 'Strong signal',   color: '#34D399' };
  if (score >= 0.38) return { text: 'Moderate signal', color: '#FBBF24' };
  return               { text: 'Thin data',           color: '#94a3b8' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CurrentMix() {
  const {
    isLoading, dataSource, dataUpdatedAt, dataRange, totalHistoricalMonths,
    currentPlan, historicalFractions, diagnosis, flaggedChannels,
    durationMonths, monthlyBudget, totalPeriodBudget, explanation,
  } = useOptimizerModel();

  const {
    budget, setBudget,
    planningPeriod, setPlanningPeriod,
    planningMode, setPlanningMode,
    customStartMonth, setCustomStartMonth,
    customEndMonth, setCustomEndMonth,
    allocations, setAllocations,
  } = useOptimizer();

  // ── Edit drawer state ────────────────────────────────────────────────────────
  // pendingAllocs mirrors all channel allocations while the drawer is open.
  // Changes only commit to context on Save — table stays stable during editing.
  const [drawerChannel, setDrawerChannel]   = useState<string | null>(null);
  const [pendingAllocs, setPendingAllocs]   = useState<Record<string, number>>({});
  const [hoveredRow,    setHoveredRow]      = useState<string | null>(null);

  const openDrawer = useCallback((ch: string) => {
    setPendingAllocs({ ...allocations });
    setDrawerChannel(ch);
  }, [allocations]);

  const closeDrawer = useCallback(() => setDrawerChannel(null), []);

  const saveAllocation = useCallback(() => {
    setAllocations({ ...pendingAllocs });
    setDrawerChannel(null);
  }, [pendingAllocs, setAllocations]);

  const resetChannelToHistorical = useCallback((ch: string) => {
    setPendingAllocs(prev => ({ ...prev, [ch]: historicalFractions[ch] ?? 0 }));
  }, [historicalFractions]);

  const normalizeAllocs = useCallback(() => {
    const total = Object.values(pendingAllocs).reduce((s, v) => s + v, 0);
    if (total === 0) return;
    setPendingAllocs(Object.fromEntries(
      Object.entries(pendingAllocs).map(([ch, v]) => [ch, v / total])
    ));
  }, [pendingAllocs]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_MONTHLY_BUDGET;

  // Period label used in the budget helper text ("… total (annual)").
  const periodLabel = (
    planningPeriod === '1m' ? 'monthly'   :
    planningPeriod === '1q' ? 'quarterly' :
    planningPeriod === '6m' ? '6 months'  :
    planningPeriod === '1y' ? 'annual'    : 'selected period'
  );

  // Budget input — we render a text input with Indian number grouping so the
  // user sees "50,00,000" (not the native-number input's "5000000"). The
  // underlying state stays numeric; we parse on every keystroke and format
  // for display. Empty input is permitted during editing so the field can be
  // cleared without snapping back.
  const [budgetInputFocused, setBudgetInputFocused] = useState(false);
  const [budgetInputDraft, setBudgetInputDraft] = useState<string>('');
  const budgetDisplayValue = budgetInputFocused
    ? budgetInputDraft
    : safeBudget.toLocaleString('en-IN');

  const pendingTotal    = Object.values(pendingAllocs).reduce((s, v) => s + v, 0);
  const pendingTotalPct = Math.round(pendingTotal * 100);
  const pendingOk       = Math.abs(pendingTotal - 1) < 0.015;
  const pendingRemaining = Math.round((1 - pendingTotal) * 100);
  const drawerBarColor  = pendingOk ? '#34D399' : Math.abs(pendingTotal - 1) < 0.08 ? '#FBBF24' : '#F87171';

  const sortedChannels = useMemo(() =>
    [...CHANNELS].sort((a, b) => {
      const sa = STATUS_ORDER[diagnosis[a]?.status ?? 'efficient'] ?? 3;
      const sb = STATUS_ORDER[diagnosis[b]?.status ?? 'efficient'] ?? 3;
      if (sa !== sb) return sa - sb;
      return (currentPlan.channels[b]?.revenue || 0) - (currentPlan.channels[a]?.revenue || 0);
    }),
  [diagnosis, currentPlan]);

  const topChannels = useMemo(() =>
    [...CHANNELS]
      .filter(ch => explanation[ch])
      .sort((a, b) => (explanation[b]?.tunedROAS || 0) - (explanation[a]?.tunedROAS || 0))
      .slice(0, 3),
  [explanation]);

  const efficientCount = CHANNELS.filter(ch => !diagnosis[ch]?.isFlagged).length;

  if (isLoading) return <DashboardSkeleton />;

  // ── Drawer channel data ──────────────────────────────────────────────────────
  const dCh      = drawerChannel;
  const dColor   = dCh ? CHANNEL_COLORS[CHANNELS.indexOf(dCh) % CHANNEL_COLORS.length] : '#E8803A';
  const dExpl    = dCh ? explanation[dCh]   : null;
  const dDiag    = dCh ? diagnosis[dCh]     : null;
  const dRow     = dCh ? currentPlan.channels[dCh] : null;
  const dStatus  = ((dDiag?.status || 'efficient') as StatusKey);
  const dSt      = STATUS_META[dStatus];
  const dPct     = dCh ? Math.round((pendingAllocs[dCh] || 0) * 100) : 0;
  const dHistPct = dCh ? Math.round((historicalFractions[dCh] || 0) * 100) : 0;
  const dDelta   = dPct - dHistPct;
  const dSpend   = dCh ? safeBudget * (pendingAllocs[dCh] || 0) : 0;
  const dConf    = dExpl ? confidenceLabel(dExpl.efficiencyConfidence) : { text: '', color: 'var(--text-muted)' };

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── A. Header — title + one subtitle line ──────────────────────────── */}
      <div>
        <h1 style={{
          fontFamily: 'Outfit', fontSize: 26, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0,
        }}>
          Current Mix
        </h1>
        <p style={{
          fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 400,
          color: 'var(--text-secondary)', margin: '5px 0 0', lineHeight: 1.5,
        }}>
          Review your allocation and modeled performance.
        </p>
      </div>

      {/* ── B. Controls — inline strip, no card header text ──────────────── */}
      <div style={{
        border: '1px solid var(--border-subtle)', borderRadius: 12,
        backgroundColor: 'var(--bg-card)',
        display: 'grid',
        gridTemplateColumns: 'minmax(160px, 220px) 1px minmax(140px, 200px) 1px auto',
        alignItems: 'stretch',
        overflow: 'hidden',
      }}>
        {/* Budget */}
        <div style={{ padding: '14px 18px' }}>
          <p style={{ ...T.overline, fontSize: 9, marginBottom: 6 }}>Monthly Budget</p>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)',
            borderRadius: 8, padding: '8px 11px',
          }}>
            <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
            <input
              type="text"
              inputMode="numeric"
              value={budgetDisplayValue}
              onFocus={() => {
                setBudgetInputFocused(true);
                setBudgetInputDraft(String(safeBudget));
              }}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                setBudgetInputDraft(digits);
                const n = digits === '' ? 0 : Number(digits);
                if (Number.isFinite(n)) setBudget(n);
              }}
              onBlur={() => {
                setBudgetInputFocused(false);
                setBudget((b) => {
                  const safe = Number.isFinite(b) && b > 0 ? b : DEFAULT_MONTHLY_BUDGET;
                  return Math.round(safe / 1000) * 1000;
                });
              }}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 15,
                color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
          <p style={{ ...T.body, fontSize: 10, marginTop: 4, opacity: 0.7 }}>
            {formatINRCompact(safeBudget)}/mo · {formatINRCompact(totalPeriodBudget)} total ({periodLabel})
          </p>
        </div>

        {/* Divider */}
        <div style={{ width: 1, backgroundColor: 'var(--border-subtle)' }} />

        {/* Period */}
        <div style={{ padding: '14px 18px' }}>
          <p style={{ ...T.overline, fontSize: 9, marginBottom: 6 }}>Planning Period</p>
          <select
            value={planningPeriod}
            onChange={e => setPlanningPeriod(e.target.value as PlanningPeriod)}
            style={{
              width: '100%', backgroundColor: 'var(--bg-root)',
              border: '1px solid var(--border-strong)', borderRadius: 8,
              color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans',
              fontSize: 13, padding: '8px 11px', outline: 'none',
            }}
          >
            <option value="1m">1 Month</option>
            <option value="1q">1 Quarter</option>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
            <option value="custom">Custom range</option>
          </select>
          {planningPeriod === 'custom' && (
            <div style={{ display: 'flex', gap: 5, marginTop: 6, alignItems: 'center' }}>
              <select value={customStartMonth} onChange={e => setCustomStartMonth(e.target.value)}
                style={{ flex: 1, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 10, padding: '5px 7px', outline: 'none' }}>
                {TIMELINE_MONTHS.map(m => <option key={m.key} value={m.key}>{MONTH_NAMES[m.month]} {m.year}</option>)}
              </select>
              <span style={{ ...T.overline, fontSize: 9 }}>→</span>
              <select value={customEndMonth} onChange={e => setCustomEndMonth(e.target.value)}
                style={{ flex: 1, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 10, padding: '5px 7px', outline: 'none' }}>
                {TIMELINE_MONTHS.map(m => <option key={m.key} value={m.key}>{MONTH_NAMES[m.month]} {m.year}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, backgroundColor: 'var(--border-subtle)' }} />

        {/* Mode — same vertical rhythm as Budget + Period (top-aligned, shared control height) */}
        <div style={{ padding: '14px 18px' }}>
          <p style={{ ...T.overline, fontSize: 9, marginBottom: 6 }}>Planning Mode</p>
          <div
            style={{
              display: 'flex',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: 'var(--bg-root)',
            }}
          >
            {(['conservative', 'target', 'aggressive'] as PlanningMode[]).map((m, i, arr) => (
              <button
                key={m}
                type="button"
                onClick={() => setPlanningMode(m)}
                style={{
                  flex: 1,
                  fontFamily: 'Outfit',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '8px 10px',
                  minHeight: 38,
                  lineHeight: 1.25,
                  cursor: 'pointer',
                  transition: '120ms',
                  border: 'none',
                  borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  borderRadius: 0,
                  backgroundColor: planningMode === m ? 'rgba(232,128,58,0.10)' : 'transparent',
                  color: planningMode === m ? '#E8803A' : 'var(--text-muted)',
                }}
              >
                {m === 'conservative' ? 'Conservative' : m === 'aggressive' ? 'Aggressive' : 'Base'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── C. KPI Strip ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          {
            label: 'Revenue Forecast',
            value: formatINRCompact(currentPlan.totalPeriodRevenue),
            sub: 'Current allocation',
            accent: '#60A5FA',
          },
          {
            label: 'Blended ROAS',
            value: `${currentPlan.blendedROAS.toFixed(2)}x`,
            sub: 'Spend-weighted return',
            accent: '#E8803A',
          },
          {
            label: 'Monthly Budget',
            value: formatINRCompact(monthlyBudget),
            sub: `${durationMonths}mo · ${formatINRCompact(totalPeriodBudget)} total`,
            accent: '#A78BFA',
          },
          {
            label: 'To Review',
            value: flaggedChannels.length === 0 ? 'All on track' : `${flaggedChannels.length} channels`,
            sub: flaggedChannels.length === 0
              ? 'No flags detected'
              : flaggedChannels.slice(0, 2).join(', ') + (flaggedChannels.length > 2 ? ` +${flaggedChannels.length - 2}` : ''),
            accent: flaggedChannels.length === 0 ? '#34D399' : '#FBBF24',
          },
        ].map(kpi => (
          <div key={kpi.label} style={{
            padding: '14px 16px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            backgroundColor: 'var(--bg-card)',
            display: 'flex', flexDirection: 'column',
          }}>
            <p style={{ ...T.overline, fontSize: 9 }}>{kpi.label}</p>
            <p style={{ ...T.num, fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', letterSpacing: '-0.025em', margin: '7px 0 3px' }}>
              {kpi.value}
            </p>
            <p style={{ ...T.body, fontSize: 11, lineHeight: 1.35, flex: 1 }}>{kpi.sub}</p>
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: 10, opacity: 0.28 }} />
          </div>
        ))}
      </div>

      {/* Compact metadata line — source of truth for the forecast */}
      <p style={{
        fontFamily: 'Plus Jakarta Sans', fontSize: 11,
        color: 'var(--text-muted)', margin: '-6px 0 0', lineHeight: 1,
      }}>
        {Math.round(totalHistoricalMonths)}mo history
        {dataRange ? ` · ${dataRange.min} – ${dataRange.max}` : ''}
        {' · '}{dataSource === 'api' ? 'Live' : dataSource === 'cached' ? 'Cached' : 'Demo data'}
      </p>

      {/* ── D. Allocation Block ──────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, backgroundColor: 'var(--bg-card)' }}>

        {/* Toolbar */}
        <div style={{
          padding: '14px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          borderRadius: '12px 12px 0 0',
        }}>
          <p style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Allocation
          </p>
          {drawerChannel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dColor }} />
              <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                Editing {drawerChannel}
              </span>
            </div>
          ) : (
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)' }}>
              Select a row to adjust
            </span>
          )}
        </div>

        {/* Table + Drawer side by side */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>

          {/* ── Main table ───────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: COL,
              padding: '8px 22px', gap: 10,
              backgroundColor: 'var(--bg-root)',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              {[
                { h: 'Channel',    align: 'left'   },
                { h: 'Allocation', align: 'right'  },
                { h: 'Spend (mo)', align: 'right'  },
                { h: 'Revenue (mo)', align: 'right'  },
                { h: 'Forecast ROAS', align: 'center' },
                { h: 'Health',     align: 'center' },
                { h: '',           align: 'center' },
              ].map(({ h, align }, i) => (
                <span key={i} style={{
                  ...T.overline, fontSize: 9,
                  textAlign: align as React.CSSProperties['textAlign'],
                  whiteSpace: 'nowrap',
                }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {sortedChannels.map(ch => {
              const color     = CHANNEL_COLORS[CHANNELS.indexOf(ch) % CHANNEL_COLORS.length];
              const row       = currentPlan.channels[ch];
              const diag      = diagnosis[ch];
              const status    = (diag?.status || 'efficient') as StatusKey;
              const st        = STATUS_META[status];
              const isSelected = drawerChannel === ch;

              const spend   = row?.spend ?? 0;
              const revenue = row?.revenue ?? 0;
              const roas    = row?.roas          ?? 0;
              const allocPct = (row?.allocationPct ?? 0).toFixed(1);

              const isHovered = hoveredRow === ch && !isSelected;

              return (
                <div
                  key={ch}
                  onMouseEnter={() => setHoveredRow(ch)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => isSelected ? closeDrawer() : openDrawer(ch)}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: isSelected
                      ? `${dColor}0E`
                      : isHovered ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderLeft: isSelected ? `2px solid ${dColor}` : '2px solid transparent',
                    cursor: 'pointer', userSelect: 'none',
                    transition: 'background-color 120ms ease',
                  }}
                >
                  <div style={{
                    display: 'grid', gridTemplateColumns: COL,
                    padding: '11px 22px', gap: 10, alignItems: 'center',
                  }}>
                    {/* Channel */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      <ChannelName channel={ch} style={{
                        fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} />
                    </div>

                    {/* Allocation */}
                    <p style={{ ...T.num, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: 0, textAlign: 'right' }}>
                      {allocPct}%
                    </p>

                    {/* Spend */}
                    <p style={{ ...T.num, fontSize: 12, color: 'var(--text-secondary)', margin: 0, textAlign: 'right' }}>
                      {formatINRCompact(spend)}
                    </p>

                    {/* Revenue */}
                    <p style={{ ...T.num, fontSize: 12, fontWeight: 700, color, margin: 0, textAlign: 'right' }}>
                      {formatINRCompact(revenue)}
                    </p>

                    {/* ROAS */}
                    <p style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: 0, textAlign: 'center' }}>
                      {roas.toFixed(2)}x
                    </p>

                    {/* Health badge */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={badgeStyle(st.color)}>
                        <span style={dotStyle(st.color)} />
                        {st.label}
                      </span>
                    </div>

                    {/* Adjust action */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); isSelected ? closeDrawer() : openDrawer(ch); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontFamily: 'Outfit', fontSize: 10, fontWeight: 600,
                          padding: '4px 9px', borderRadius: 5, cursor: 'pointer', transition: '120ms',
                          border: isSelected
                            ? `1px solid ${dColor}55`
                            : isHovered ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                          backgroundColor: isSelected ? `${dColor}12` : 'transparent',
                          color: isSelected ? dColor : isHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
                        }}
                      >
                        <SlidersHorizontal size={9} />
                        {isSelected ? 'Close' : 'Adjust'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Table footer — persistent committed allocation summary */}
            {(() => {
              const committedTotal    = Object.values(allocations).reduce((s, v) => s + v, 0);
              const committedPct      = Math.round(committedTotal * 100);
              const committedOk       = Math.abs(committedTotal - 1) < 0.015;
              const committedDelta    = Math.round((1 - committedTotal) * 100);
              const committedColor    = committedOk ? '#34D399' : Math.abs(committedTotal - 1) < 0.08 ? '#FBBF24' : '#F87171';

              return (
                <div style={{
                  padding: '10px 22px',
                  borderTop: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-root)',
                  borderRadius: drawerChannel ? '0' : '0 0 12px 12px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ ...T.overline, fontSize: 9 }}>Total allocated</span>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'var(--border-strong)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(committedPct, 100)}%`,
                      backgroundColor: committedColor, opacity: 0.55, borderRadius: 2,
                      transition: 'width 120ms ease, background-color 150ms ease',
                    }} />
                  </div>
                  <span style={{ ...T.num, fontSize: 12, fontWeight: 800, color: committedColor }}>
                    {committedPct}%
                  </span>
                  {committedOk ? (
                    <span style={{ ...T.body, fontSize: 11, color: committedColor }}>Valid</span>
                  ) : (
                    <>
                      <span style={{ ...T.body, fontSize: 11, color: committedColor }}>
                        {committedDelta > 0 ? `${committedDelta}% unassigned` : `${Math.abs(committedDelta)}% over`}
                      </span>
                      <button
                        onClick={() => setAllocations(
                          Object.fromEntries(
                            Object.entries(allocations).map(([k, v]) => [k, committedTotal > 0 ? v / committedTotal : v])
                          )
                        )}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontFamily: 'Outfit', fontSize: 10, fontWeight: 700,
                          padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
                          border: `1px solid ${committedColor}44`,
                          backgroundColor: `${committedColor}0D`,
                          color: committedColor,
                        }}
                      >
                        <Scale size={10} /> Rebalance
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── Edit Drawer ──────────────────────────────────────────────── */}
          {drawerChannel && dCh && (
            <div style={{
              width: 296,
              flexShrink: 0,
              borderLeft: '1px solid var(--border-strong)',
              display: 'flex',
              flexDirection: 'column',
              alignSelf: 'stretch',
              borderRadius: '0 0 12px 0',
            }}>

              {/* Drawer header */}
              <div style={{
                padding: '13px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dColor }} />
                  <ChannelName channel={dCh} style={{
                    fontFamily: 'Plus Jakarta Sans', fontSize: 14, fontWeight: 700,
                    color: 'var(--text-primary)',
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={badgeStyle(dSt.color)}>
                    <span style={dotStyle(dSt.color)} />
                    {dSt.label}
                  </span>
                  <button
                    onClick={closeDrawer}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: 'var(--text-muted)', borderRadius: 5,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Drawer body — scrollable */}
              <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>

                {/* Allocation control */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                    <p style={{ ...T.overline, fontSize: 9 }}>Allocation</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span style={{ ...T.num, fontSize: 30, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                        {dPct}%
                      </span>
                      {dDelta !== 0 && (
                        <span style={{
                          fontFamily: 'Outfit', fontSize: 11, fontWeight: 700,
                          color: dDelta > 0 ? '#34D399' : '#F87171',
                        }}>
                          {dDelta > 0 ? '+' : ''}{dDelta}%
                        </span>
                      )}
                    </div>
                  </div>

                  <Slider
                    value={[dPct]}
                    min={0} max={60} step={1}
                    onValueChange={([v]) =>
                      setPendingAllocs(prev => ({ ...prev, [dCh]: v / 100 }))
                    }
                    onValueCommit={() => {}}
                  />

                  {/* Scale labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
                    <span style={{ ...T.body, fontSize: 10 }}>0%</span>
                    <button
                      onClick={() => resetChannelToHistorical(dCh)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: '1px solid var(--border-subtle)',
                        borderRadius: 5, padding: '2px 7px', cursor: 'pointer',
                        fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
                      }}
                    >
                      <RotateCcw size={8} /> hist. {dHistPct}%
                    </button>
                    <span style={{ ...T.body, fontSize: 10 }}>60%</span>
                  </div>
                </div>

                {/* Spend preview */}
                <div style={{
                  padding: '10px 12px', backgroundColor: 'var(--bg-root)',
                  borderRadius: 8, border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...T.body, fontSize: 12 }}>Monthly spend</span>
                    <span style={{ ...T.num, fontSize: 13, fontWeight: 800, color: dColor }}>
                      {formatINRCompact(dSpend)}
                    </span>
                  </div>
                  <p style={{ ...T.body, fontSize: 11, marginTop: 4, lineHeight: 1.4, opacity: 0.75 }}>
                    Revenue forecast updates after saving.
                  </p>
                </div>

                {/* Efficiency context */}
                {dExpl && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                    {[
                      { k: 'Tuned ROAS',       v: `${dExpl.tunedROAS.toFixed(2)}x` },
                      { k: 'Blended median',   v: `${dExpl.portfolioROAS.toFixed(2)}x` },
                      { k: 'ROAS at current',  v: `${dRow?.roas?.toFixed(2) ?? '—'}x` },
                      { k: 'Marginal ROAS',    v: `${dRow?.marginalROAS?.toFixed(2) ?? '—'}x` },
                    ].map(({ k, v }, i) => (
                      <div key={k} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '7px 12px',
                        backgroundColor: i % 2 === 0 ? 'var(--bg-root)' : 'transparent',
                      }}>
                        <span style={{ ...T.body, fontSize: 11 }}>{k}</span>
                        <span style={{ ...T.num, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ padding: '7px 12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ ...T.body, fontSize: 11 }}>Signal quality</span>
                      <span style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: dConf.color }}>{dConf.text}</span>
                    </div>
                  </div>
                )}

                {/* Timing note */}
                {dExpl && (dExpl.seasonalityStrength !== 'weak' || dExpl.dowEffectStrength !== 'weak') && (
                  <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-root)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <p style={{ ...T.overline, fontSize: 9, marginBottom: 7 }}>Timing</p>
                    {dExpl.seasonalityStrength !== 'weak' && (
                      <p style={{ ...T.body, fontSize: 11, lineHeight: 1.5, marginBottom: 5 }}>
                        Peak month:{' '}
                        <strong style={{ color: 'var(--text-primary)', fontFamily: 'Outfit' }}>{MONTH_NAMES[dExpl.peakMonth]}</strong>
                        {` (+${Math.round(dExpl.peakBoost * 100)}%) · `}
                        <span style={{ color: dExpl.seasonalityStrength === 'strong' ? '#34D399' : '#FBBF24' }}>
                          {dExpl.seasonalityStrength}
                        </span>
                      </p>
                    )}
                    {dExpl.dowEffectStrength !== 'weak' && (
                      <p style={{ ...T.body, fontSize: 11, lineHeight: 1.5 }}>
                        Best day:{' '}
                        <strong style={{ color: 'var(--text-primary)', fontFamily: 'Outfit' }}>{DOW_NAMES[dExpl.bestDay]}</strong>
                        {dExpl.weekendBias !== 'neutral' ? ` · ${dExpl.weekendBias} bias` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Assessment */}
                {dDiag && (
                  <div>
                    <p style={{ ...T.overline, fontSize: 9, marginBottom: 7 }}>Assessment</p>
                    <p style={{ ...T.body, fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                      {dDiag.explanation || `${dCh} is operating within a normal efficiency range.`}
                    </p>
                    {dDiag.reasonCode && dDiag.reasonCode !== 'Efficient allocation' && (
                      <span style={{
                        ...badgeStyle(dSt.color),
                        marginTop: 8,
                      }}>
                        {dDiag.reasonCode}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Drawer footer — portfolio summary + actions */}
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-strong)',
                flexShrink: 0,
                backgroundColor: 'var(--bg-root)',
                borderRadius: '0 0 12px 0',
              }}>
                {/* Allocation total */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ ...T.overline, fontSize: 9 }}>Allocation total</span>
                    <span style={{ ...T.num, fontSize: 12, fontWeight: 800, color: drawerBarColor }}>
                      {pendingTotalPct}%
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--border-strong)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(pendingTotalPct, 100)}%`,
                      backgroundColor: drawerBarColor, opacity: 0.65, borderRadius: 2,
                      transition: 'width 80ms ease, background-color 150ms ease',
                    }} />
                  </div>
                  {!pendingOk && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <span style={{ ...T.body, fontSize: 11, color: drawerBarColor }}>
                        {pendingRemaining > 0 ? `${pendingRemaining}% unassigned` : `${Math.abs(pendingRemaining)}% over`}
                      </span>
                      <button
                        onClick={normalizeAllocs}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontFamily: 'Outfit', fontSize: 9, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                          border: `1px solid ${drawerBarColor}44`,
                          backgroundColor: `${drawerBarColor}0D`,
                          color: drawerBarColor,
                        }}
                      >
                        <Scale size={9} /> Rebalance
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={closeDrawer}
                    style={{
                      flex: 1, fontFamily: 'Outfit', fontSize: 11, fontWeight: 600,
                      padding: '8px 0', borderRadius: 7, cursor: 'pointer',
                      border: '1px solid var(--border-strong)',
                      backgroundColor: 'transparent', color: 'var(--text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveAllocation}
                    style={{
                      flex: 2, fontFamily: 'Outfit', fontSize: 12, fontWeight: 700,
                      padding: '8px 0', borderRadius: 7, cursor: 'pointer',
                      border: 'none',
                      background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
                      color: '#000',
                    }}
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── E. Mix snapshot — compact insight strip ───────────────────────── */}
      <div style={{
        border: '1px solid var(--border-subtle)', borderRadius: 12,
        backgroundColor: 'var(--bg-card)',
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
        overflow: 'hidden',
      }}>
        {/* Top performers */}
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <TrendingUp size={10} color="#34D399" />
            <p style={{ ...T.overline, fontSize: 9, color: '#34D399' }}>Top performers</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topChannels.map(ch => {
              const ex = explanation[ch];
              const r  = currentPlan.channels[ch];
              return (
                <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }} />
                  <span style={{ ...T.num, fontSize: 11, fontWeight: 700, color: '#34D399' }}>
                    {(ex?.tunedROAS ?? r?.roas ?? 0).toFixed(2)}x
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ width: 1, backgroundColor: 'var(--border-subtle)' }} />

        {/* Flagged */}
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Activity size={10} color={flaggedChannels.length > 0 ? '#FBBF24' : '#34D399'} />
            <p style={{ ...T.overline, fontSize: 9, color: flaggedChannels.length > 0 ? '#FBBF24' : '#34D399' }}>
              {flaggedChannels.length > 0 ? `${flaggedChannels.length} flagged` : 'All on track'}
            </p>
          </div>
          {flaggedChannels.length === 0 ? (
            <p style={{ ...T.body, fontSize: 12 }}>No channels need immediate attention.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {flaggedChannels.slice(0, 3).map(ch => {
                const d  = diagnosis[ch];
                const st = STATUS_META[(d?.status || 'efficient') as StatusKey];
                return (
                  <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }} />
                    <span style={badgeStyle(st.color)}>
                      <span style={dotStyle(st.color)} />
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ width: 1, backgroundColor: 'var(--border-subtle)' }} />

        {/* Summary */}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Minus size={10} color="var(--text-muted)" />
            <p style={{ ...T.overline, fontSize: 9 }}>Takeaway</p>
          </div>
          <p style={{ ...T.body, fontSize: 12, lineHeight: 1.6 }}>
            {formatINRCompact(currentPlan.totalPeriodRevenue)}
            {' at '}{currentPlan.blendedROAS.toFixed(2)}x ROAS.
            {' '}
            {efficientCount === CHANNELS.length
              ? 'All channels within range.'
              : `${efficientCount}/${CHANNELS.length} channels balanced.`}
          </p>
        </div>
      </div>

      {/* ── F. CTA ────────────────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap' as const,
        borderColor: 'rgba(232,128,58,0.22)',
      }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Ready to explore the recommendation?
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 4 }}>
            The next step shows how the model would redistribute this budget to improve forecast return.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexShrink: 0 }}>
          <Link to="/optimizer/diagnosis" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 15px', borderRadius: 9,
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)',
            fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}>
            Open Diagnosis
          </Link>
          <Link to="/optimizer/recommended" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: 9,
            background: 'linear-gradient(135deg, #E8803A, #FBBF24)',
            color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
          }}>
            See Recommended Mix <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

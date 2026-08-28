/**
 * Mix Optimiser — single page.
 * Recommended split of the monthly budget by 3-year average ROAS,
 * with Email ≤ ₹15L and SMS ≤ ₹12L. Revenue = spend × avg ROAS.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowLeft, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { useOptimizer, DEFAULT_MONTHLY_BUDGET } from '@/contexts/OptimizerContext';
import { toast } from '@/hooks/use-toast';
import { CHANNELS } from '@/lib/mockData';
import { CHANNEL_SPEND_CAPS, normalizeAllocationShares } from '@/lib/optimizer/calculations';
import { formatINRCompact, formatROAS } from '@/lib/formatCurrency';
import { T, CARD, badgeStyle, STATUS_META } from '@/pages/optimizer/_shared/ui';

function sharesMatch(a: Record<string, number>, b: Record<string, number>): boolean {
  return CHANNELS.every(ch => Math.abs((a[ch] || 0) - (b[ch] || 0)) < 0.002);
}

function formatINR2(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MixOptimizer() {
  const {
    isLoading,
    optimizedPlan,
    historicalFractions,
    monthlyBudget,
  } = useOptimizerModel();

  const { allocations, setMonthlyBudget, setAllocations } = useOptimizer();
  const [howOpen, setHowOpen] = useState(false);
  const [budgetFocused, setBudgetFocused] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');

  const safeBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0
    ? monthlyBudget
    : DEFAULT_MONTHLY_BUDGET;

  const budgetDisplay = budgetFocused
    ? budgetDraft
    : safeBudget.toLocaleString('en-IN');

  const comparison = useMemo(() => {
    return CHANNELS.map(ch => {
      const histPct = (historicalFractions[ch] || 0) * 100;
      const rec = optimizedPlan.channels[ch];
      const recPct = rec?.allocationPct ?? 0;
      const recSpend = rec?.spend ?? 0;
      const roas = rec?.roas ?? 0;
      const histSpend = (histPct / 100) * safeBudget;
      const histRevenue = histSpend * roas;
      const recRevenue = rec?.revenue ?? recSpend * roas;
      const deltaPct = recPct - histPct;
      return { ch, histPct, recPct, recSpend, roas, histSpend, histRevenue, recRevenue, deltaPct };
    });
  }, [historicalFractions, optimizedPlan, safeBudget]);

  const rows = useMemo(
    () => [...comparison].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)),
    [comparison],
  );

  const chartData = useMemo(
    () =>
      comparison.map(r => ({
        channel: r.ch.replace('Google ', 'G. ').replace('Instagram ', 'IG '),
        current: r.histSpend / 100000,
        recommended: r.recSpend / 100000,
      })),
    [comparison],
  );

  const recRevenue = optimizedPlan.totalMonthlyRevenue;
  const histRevenueTotal = comparison.reduce((s, r) => s + r.histRevenue, 0);
  const histRoas = safeBudget > 0 ? histRevenueTotal / safeBudget : 0;
  const upliftPct = histRevenueTotal > 0 ? ((recRevenue - histRevenueTotal) / histRevenueTotal) * 100 : 0;
  const recommendedActive = sharesMatch(allocations, optimizedPlan.allocationShares);
  const historicalActive =
    CHANNELS.every(ch => !(allocations[ch] > 0)) ||
    sharesMatch(allocations, historicalFractions);
  const kpiRevenue = recommendedActive ? recRevenue : histRevenueTotal;
  const kpiRoas = recommendedActive ? optimizedPlan.blendedROAS : histRoas;

  const applyRecommended = () => {
    setAllocations(normalizeAllocationShares({ ...optimizedPlan.allocationShares }));
    toast({
      title: 'Recommended mix applied',
      description: 'Scenario Planner now uses this split. Current vs recommended in the table stays historical vs ROAS.',
    });
  };

  const resetHistorical = () => {
    setAllocations(normalizeAllocationShares({ ...historicalFractions }));
    toast({
      title: 'Historical mix restored',
      description: 'Forecasts are back on the 3-year spend share.',
    });
  };

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div style={{ maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'Outfit', fontSize: 12, fontWeight: 600,
              color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 10,
            }}
          >
            <ArrowLeft size={14} /> Back to Overview
          </Link>
          <h1 style={{
            fontFamily: 'Outfit', fontSize: 26, fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0,
          }}>
            Mix Optimiser
          </h1>
          <p style={{
            fontFamily: 'Plus Jakarta Sans', fontSize: 13,
            color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 560,
          }}>
            How to split the monthly budget across 10 channels to maximise expected revenue.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ ...T.overline }}>Monthly budget</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)',
            borderRadius: 8, padding: '8px 12px', minWidth: 168,
          }}>
            <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
            <input
              type="text"
              inputMode="numeric"
              value={budgetDisplay}
              onFocus={() => {
                setBudgetFocused(true);
                setBudgetDraft(String(safeBudget));
              }}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                setBudgetDraft(digits);
                const n = digits === '' ? 0 : Number(digits);
                if (Number.isFinite(n)) setMonthlyBudget(n);
              }}
              onBlur={() => {
                setBudgetFocused(false);
                setMonthlyBudget((b) => {
                  const safe = Number.isFinite(b) && b > 0 ? b : DEFAULT_MONTHLY_BUDGET;
                  return Math.round(safe / 1000) * 1000;
                });
              }}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 15,
                color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', width: 120,
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <p style={{ ...T.overline, marginBottom: 8 }}>Expected monthly revenue</p>
          <p style={{
            fontFamily: 'Outfit', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em',
            color: 'var(--text-primary)', margin: 0, lineHeight: 1.1,
          }}>
            {formatINRCompact(kpiRevenue)}
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 8 }}>
            {formatINR2(kpiRevenue)} at the {recommendedActive ? 'recommended' : 'historical'} mix
          </p>
        </div>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <p style={{ ...T.overline, marginBottom: 8 }}>Blended ROAS</p>
          <p style={{
            fontFamily: 'Outfit', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em',
            color: 'var(--text-primary)', margin: 0, lineHeight: 1.1,
          }}>
            {formatROAS(kpiRoas)}
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 8 }}>
            {recommendedActive
              ? `vs ${formatROAS(histRoas)} on the historical mix`
              : `${formatROAS(optimizedPlan.blendedROAS)} if you switch to recommended`}
          </p>
        </div>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <p style={{ ...T.overline, marginBottom: 8 }}>Uplift vs current mix</p>
          <p style={{
            fontFamily: 'Outfit', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em',
            color: '#34D399', margin: 0, lineHeight: 1.1,
          }}>
            {upliftPct >= 0 ? '+' : ''}{upliftPct.toFixed(1)}%
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 8 }}>
            {formatINRCompact(recRevenue - histRevenueTotal)} more per month
          </p>
        </div>
      </div>

      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Channel allocation
            </p>
            <p style={{ ...T.body, fontSize: 12, marginTop: 4 }}>
              {recommendedActive
                ? 'Current = historical spend share. Recommended = proportional to 3-year average ROAS.'
                : 'Share of spend over the 3-year history. Use recommended mix to see the ROAS split.'}
            </p>
            {recommendedActive && (
              <p style={{
                fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: '#34D399', marginTop: 8,
              }}>
                Recommended mix is active
              </p>
            )}
            {historicalActive && !recommendedActive && (
              <p style={{
                fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginTop: 8,
              }}>
                Active mix = historical spend share
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={resetHistorical}
              disabled={historicalActive}
              style={{
                fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
                padding: '9px 16px', borderRadius: 9,
                cursor: historicalActive ? 'default' : 'pointer',
                border: '1px solid var(--border-strong)', backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                opacity: historicalActive ? 0.5 : 1,
              }}
            >
              Reset to historical mix
            </button>
            <button
              type="button"
              onClick={applyRecommended}
              disabled={recommendedActive}
              style={{
                fontFamily: 'Outfit', fontSize: 13, fontWeight: 700,
                padding: '9px 16px', borderRadius: 9,
                cursor: recommendedActive ? 'default' : 'pointer',
                border: 'none',
                backgroundColor: recommendedActive ? '#14532d' : '#E8803A',
                color: recommendedActive ? '#86efac' : '#1a120c',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {recommendedActive ? <><Check size={14} /> Recommended mix applied</> : 'Use recommended mix'}
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {(recommendedActive
                  ? ['Channel', 'Current', 'Recommended', 'Rec. spend', 'Avg ROAS', 'Expected revenue', 'Change']
                  : ['Channel', 'Current', 'Spend', 'Avg ROAS', 'Expected revenue']
                ).map(h => (
                  <th
                    key={h}
                    style={{
                      ...T.overline,
                      textAlign: h === 'Channel' ? 'left' : 'right',
                      padding: '10px 16px',
                      fontWeight: 600,
                    }}
                  >
                    {h === 'Change' ? '' : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const statusKey = r.deltaPct >= 0.5
                  ? 'under-scaled'
                  : r.deltaPct <= -0.5
                    ? 'over-scaled'
                    : 'efficient';
                const status = STATUS_META[statusKey];
                return (
                  <tr
                    key={r.ch}
                    style={{
                      backgroundColor: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <ChannelName channel={r.ch} />
                    </td>
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {r.histPct.toFixed(1)}%
                    </td>
                    {recommendedActive && (
                      <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {r.recPct.toFixed(1)}%
                      </td>
                    )}
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {formatINRCompact(recommendedActive ? r.recSpend : r.histSpend)}
                    </td>
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {formatROAS(r.roas)}
                    </td>
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatINRCompact(recommendedActive ? r.recRevenue : r.histRevenue)}
                    </td>
                    {recommendedActive && (
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontFamily: 'Outfit', fontSize: 12, fontWeight: 700,
                          color: r.deltaPct > 0.5 ? '#34D399' : r.deltaPct < -0.5 ? '#F87171' : '#94a3b8',
                          marginRight: 8,
                        }}>
                          {r.deltaPct > 0 ? '+' : ''}{r.deltaPct.toFixed(1)} pp
                        </span>
                        <span style={badgeStyle(status.color)}>{status.label}</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: 'var(--bg-root)' }}>
                <td style={{ padding: '12px 16px', fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Total
                </td>
                <td />
                {recommendedActive && <td />}
                <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatINRCompact(safeBudget)}
                </td>
                <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatROAS(recommendedActive ? optimizedPlan.blendedROAS : histRoas)}
                </td>
                <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatINR2(recommendedActive ? recRevenue : histRevenueTotal)}
                </td>
                {recommendedActive && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ ...CARD }}>
        <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          {recommendedActive ? 'Current vs recommended spend' : 'Historical spend'}
        </p>
        <p style={{ ...T.body, fontSize: 12, marginBottom: 12 }}>Monthly spend in ₹ lakh</p>
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'Outfit' }}
                axisLine={false}
                tickLine={false}
                unit="L"
              />
              <YAxis
                type="category"
                dataKey="channel"
                width={108}
                tick={{ fontSize: 11, fill: 'var(--text-primary)', fontFamily: 'Outfit' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [`₹${value.toFixed(2)}L`, name]}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--text-secondary)' }}
              />
              <Bar dataKey="current" name={recommendedActive ? 'Current' : 'Spend'} fill="rgba(148,163,184,0.55)" radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
              {recommendedActive && (
                <Bar dataKey="recommended" name="Recommended" fill="#E8803A" radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setHowOpen(v => !v)}
        style={{
          ...CARD,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {howOpen ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
          <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            How this is calculated
          </span>
        </span>
        {howOpen && (
          <ol style={{
            ...T.body, fontSize: 13, margin: '12px 0 0', paddingLeft: 22, lineHeight: 1.7,
          }}>
            <li>Average ROAS for each channel is total revenue ÷ total spend over the full 3-year daily history.</li>
            <li>The monthly budget is split in proportion to those ROAS values.</li>
            <li>
              Email cannot exceed {formatINRCompact(CHANNEL_SPEND_CAPS.Email)} and SMS cannot exceed {formatINRCompact(CHANNEL_SPEND_CAPS.SMS)}.
              Unused budget is given to other channels by the same ROAS weights. At ₹50L neither cap binds.
            </li>
            <li>Expected monthly revenue is the sum of allocation × average ROAS, shown to 2 decimal places.</li>
          </ol>
        )}
      </button>
    </div>
  );
}

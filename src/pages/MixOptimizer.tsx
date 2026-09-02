/**
 * Mix Optimiser — single page.
 * Split the monthly budget by equalising marginal ROAS on concave log response curves.
 * Caps by channel name only: Email ≤ ₹15L, SMS ≤ ₹12L.
 */
import { useMemo, useState, type CSSProperties } from 'react';
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
    historicalMixPlan,
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
      const hist = historicalMixPlan.channels[ch];
      const recPct = rec?.allocationPct ?? 0;
      const recSpend = rec?.spend ?? 0;
      const histSpend = hist?.spend ?? (histPct / 100) * safeBudget;
      const avgRoas = rec?.historicalROAS ?? hist?.historicalROAS ?? 0;
      const histRevenue = hist?.revenue ?? 0;
      const recRevenue = rec?.revenue ?? 0;
      const recMarginal = rec?.marginalROAS ?? 0;
      const deltaPct = recPct - histPct;
      return {
        ch, histPct, recPct, recSpend, histSpend, avgRoas,
        histRevenue, recRevenue, recMarginal, deltaPct,
      };
    });
  }, [historicalFractions, optimizedPlan, historicalMixPlan, safeBudget]);

  const rows = comparison;

  const recRevenue = optimizedPlan.totalMonthlyRevenue;
  const histRevenueTotal = historicalMixPlan.totalMonthlyRevenue;
  const histRoas = historicalMixPlan.blendedROAS;
  const upliftPct = histRevenueTotal > 0 ? ((recRevenue - histRevenueTotal) / histRevenueTotal) * 100 : 0;
  const recommendedActive = sharesMatch(allocations, optimizedPlan.allocationShares);
  const historicalActive =
    CHANNELS.every(ch => !(allocations[ch] > 0)) ||
    sharesMatch(allocations, historicalFractions);
  const kpiRevenue = recommendedActive ? recRevenue : histRevenueTotal;
  const kpiRoas = recommendedActive ? optimizedPlan.blendedROAS : histRoas;

  const chartData = useMemo(
    () =>
      comparison.map(r => ({
        channel: r.ch.replace('Google ', 'G. ').replace('Instagram ', 'IG '),
        current: r.histSpend / 100000,
        recommended: r.recSpend / 100000,
      })),
    [comparison],
  );

  const applyRecommended = () => {
    setAllocations(normalizeAllocationShares({ ...optimizedPlan.allocationShares }));
    toast({
      title: 'Recommended mix applied',
      description: 'Scenario Planner now uses this split. Table still compares historical share vs the curve recommendation.',
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
            How to split the monthly budget so the next rupee earns the same return on every channel — not a flat historical ROAS. Concave log curves, KKT water-fill.
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
            {formatINR2(kpiRevenue)} on the fitted curves, {recommendedActive ? 'recommended' : 'historical'} mix of this budget
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
              ? `vs ${formatROAS(histRoas)} if this budget kept 3-year spend shares`
              : `${formatROAS(optimizedPlan.blendedROAS)} on the recommended mix`}
          </p>
        </div>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <p style={{ ...T.overline, marginBottom: 8 }}>Uplift vs historical mix</p>
          <p style={{
            fontFamily: 'Outfit', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em',
            color: '#34D399', margin: 0, lineHeight: 1.1,
          }}>
            {upliftPct >= 0 ? '+' : ''}{upliftPct.toFixed(1)}%
          </p>
          <p style={{ ...T.body, fontSize: 12, marginTop: 8 }}>
            {formatINRCompact(recRevenue - histRevenueTotal)} more per month at the same budget
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
              {recommendedActive ? 'Recommended vs historical share' : 'Historical mix'}
            </p>
            <p style={{ ...T.body, fontSize: 12, marginTop: 4 }}>
              {recommendedActive
                ? 'Historical % is 3-year spend share. Recommended is the water-fill on this monthly budget.'
                : 'This monthly budget split by 3-year spend share. Avg ROAS is from the 3-year file.'}
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
                  ? ['Channel', 'Historical', 'Recommended', 'Rec. spend', 'Avg ROAS', 'Marg. ROAS', 'Expected revenue', 'Change']
                  : ['Channel', 'Share', 'Spend', 'Avg ROAS', 'Expected revenue']
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
                const cell: CSSProperties = {
                  ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)',
                };
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
                    {recommendedActive ? (
                      <>
                        <td style={cell}>{r.histPct.toFixed(1)}%</td>
                        <td style={{ ...cell, fontWeight: 700, color: 'var(--text-primary)' }}>{r.recPct.toFixed(1)}%</td>
                        <td style={cell}>{formatINRCompact(r.recSpend)}</td>
                        <td style={cell}>{formatROAS(r.avgRoas)}</td>
                        <td style={cell}>{formatROAS(r.recMarginal)}</td>
                        <td style={{ ...cell, fontWeight: 700, color: 'var(--text-primary)' }}>{formatINRCompact(r.recRevenue)}</td>
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
                      </>
                    ) : (
                      <>
                        <td style={cell}>{r.histPct.toFixed(1)}%</td>
                        <td style={{ ...cell, fontWeight: 700, color: 'var(--text-primary)' }}>{formatINRCompact(r.histSpend)}</td>
                        <td style={cell}>{formatROAS(r.avgRoas)}</td>
                        <td style={{ ...cell, fontWeight: 700, color: 'var(--text-primary)' }}>{formatINRCompact(r.histRevenue)}</td>
                      </>
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
                {recommendedActive ? (
                  <>
                    <td />
                    <td />
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatINRCompact(safeBudget)}
                    </td>
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatROAS(optimizedPlan.blendedROAS)}
                    </td>
                    <td />
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatINRCompact(recRevenue)}
                    </td>
                    <td />
                  </>
                ) : (
                  <>
                    <td />
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatINRCompact(safeBudget)}
                    </td>
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatROAS(histRoas)}
                    </td>
                    <td style={{ ...T.num, padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatINRCompact(histRevenueTotal)}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ ...CARD }}>
        <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          {recommendedActive ? 'Historical share vs recommended spend' : 'Historical mix spend'}
        </p>
        <p style={{ ...T.body, fontSize: 12, marginBottom: 12 }}>Monthly spend in ₹ lakh at the planning budget</p>
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
              <Bar
                dataKey="current"
                name={recommendedActive ? 'Historical share' : 'Spend'}
                fill="rgba(148,163,184,0.55)"
                radius={[0, 3, 3, 0]}
                barSize={8}
                isAnimationActive={false}
              />
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
            <li>Each channel gets a concave log curve from daily spend vs revenue: revenue = a · ln(1 + spend/b). Convex fits are rejected.</li>
            <li>Average ROAS is total revenue ÷ total spend over 3 years. Marginal ROAS is the slope of the curve at the recommended spend — the return on the next rupee.</li>
            <li>The budget is allocated so interior (uncapped, funded) channels share the same marginal ROAS (KKT water-fill). Caps apply only to Email and SMS by name. Channels with intercept below λ can receive ₹0.</li>
            <li>
              Email cannot exceed {formatINRCompact(CHANNEL_SPEND_CAPS.Email)} and SMS cannot exceed {formatINRCompact(CHANNEL_SPEND_CAPS.SMS)}.
            </li>
            <li>Historical mix spend is this monthly budget × 3-year spend share. It is not the 3-year rupee totals. Expected revenue is the curve at that spend.</li>
          </ol>
        )}
      </button>
    </div>
  );
}

/**
 * WhyItWorks — Page 4 of Mix Optimiser
 *
 * DATA CONTRACT — reads from model:
 *   explanation, totalHistoricalMonths, dataRange, dataSource
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { OptimizerSubnav } from '@/components/optimizer/OptimizerSubnav';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { ArrowRight } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const T = {
  overline: { fontFamily: 'Outfit' as const, fontSize: 10, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0 },
  helper:   { fontFamily: 'Plus Jakarta Sans' as const, fontSize: 13, fontWeight: 400 as const, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
};
const CARD = { padding: '20px 24px', border: '1px solid var(--border-subtle)', borderRadius: 14, backgroundColor: 'var(--bg-card)' };
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function WhyItWorks() {
  const { isLoading, explanation, totalHistoricalMonths, dataRange, dataSource } = useOptimizerModel();

  const [selectedChannel, setSelectedChannel] = useState(CHANNELS[0]);

  if (isLoading) return <DashboardSkeleton />;

  const expl        = explanation[selectedChannel];
  const chColor     = CHANNEL_COLORS[CHANNELS.indexOf(selectedChannel) % CHANNEL_COLORS.length];
  const hasCurve    = (expl?.saturationCurve?.length || 0) > 1;

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <OptimizerSubnav />

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Why It Works
        </h1>
        <p style={{ ...T.helper, marginTop: 6 }}>
          The methodology behind the recommendation — diminishing returns, seasonality, and day-of-week effects, channel by channel.
        </p>
        <p style={{ ...T.helper, fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
          Fitted from {Math.round(totalHistoricalMonths)} months of data
          {dataRange ? ` (${dataRange.min} → ${dataRange.max})` : ''} · Source: {dataSource}
        </p>
      </div>

      {/* ── Optimization logic explainer ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { step: '01', title: 'Fit diminishing returns', body: 'For each channel, we fit a concave log-model: revenue = α · ln(spend + 1). The coefficient α captures how efficiently a channel converts spend into revenue, normalised for seasonality.' },
          { step: '02', title: 'Apply timing effects',   body: 'Seasonality indices and day-of-week multipliers are derived from historical patterns. Each month\'s forecast includes a time-weight sum Σ(seasonality × day-of-week blend) for the planning period.' },
          { step: '03', title: 'Solve for optimal mix',  body: 'We solve the constrained optimisation problem: maximise Σ αᵢ · ln(xᵢ + 1) · Wᵢ subject to total spend = budget. Channels are bounded to avoid extreme concentrations.' },
          { step: '04', title: 'Compare vs current',     body: 'The recommended allocation is run through the same forecast engine as your current allocation. Uplift is the difference — not a model assumption, but a direct forecast comparison.' },
        ].map(s => (
          <div key={s.step} style={{ ...CARD }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 28, fontWeight: 900, color: 'var(--border-strong)', letterSpacing: '-0.04em', margin: '0 0 10px' }}>{s.step}</p>
            <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>{s.title}</p>
            <p style={{ ...T.helper, fontSize: 12, lineHeight: 1.6 }}>{s.body}</p>
          </div>
        ))}
      </div>

      {/* ── Channel selector ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ ...T.overline }}>Channel deep-dive:</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CHANNELS.map((ch, i) => (
            <button key={ch} onClick={() => setSelectedChannel(ch)} style={{
              fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', transition: '100ms',
              border: selectedChannel === ch ? `1px solid ${CHANNEL_COLORS[i]}` : '1px solid var(--border-subtle)',
              backgroundColor: selectedChannel === ch ? `${CHANNEL_COLORS[i]}22` : 'transparent',
              color: selectedChannel === ch ? CHANNEL_COLORS[i] : 'var(--text-muted)',
            }}>{ch}</button>
          ))}
        </div>
      </div>

      {expl && (
        <>
          {/* Channel summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { label: 'Historical ROAS',      value: `${expl.historicalROAS.toFixed(2)}x`,   note: 'Total revenue ÷ total spend over the full historical dataset.' },
              { label: 'Portfolio ROAS',        value: `${expl.portfolioROAS.toFixed(2)}x`,    note: 'Blended across all channels.' },
              { label: 'Marginal ROAS @ current spend', value: `${expl.marginalROASAtCurrent.toFixed(2)}x`, note: 'dRevenue / dSpend at the current allocation level.' },
              { label: 'Marginal ROAS @ recommended',  value: `${expl.marginalROASAtRecommended.toFixed(2)}x`, note: 'dRevenue / dSpend at the recommended spend level.' },
              { label: 'Peak seasonality month', value: MONTH_NAMES[expl.peakMonth], note: `+${Math.round(expl.peakBoost * 100)}% above the annual average in this month.` },
              { label: 'Best day of week',       value: DOW_SHORT[expl.bestDay],  note: 'Highest historically observed ROAS by day of week.' },
            ].map(k => (
              <div key={k.label} style={{ ...CARD }}>
                <p style={T.overline}>{k.label}</p>
                <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: chColor, letterSpacing: '-0.02em', margin: '6px 0 0' }}>{k.value}</p>
                <p style={{ ...T.helper, fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{k.note}</p>
              </div>
            ))}
          </div>

          {/* Diminishing returns curve */}
          <div style={{ ...CARD }}>
            <p style={{ ...T.overline, marginBottom: 4 }}>Diminishing returns — {selectedChannel}</p>
            <p style={{ ...T.helper, fontSize: 12, marginBottom: 20 }}>
              Each data point is a historical monthly observation. As spend rises, ROAS falls — the channel saturates.
              {Number.isFinite(expl.capSpend) && ` Modelled saturation cap around ${Math.round(expl.capSpend / 1000)}K/mo.`}
            </p>
            {hasCurve ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={expl.saturationCurve} margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="spend" tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} tick={{ fontFamily: 'Outfit', fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}x`} tick={{ fontFamily: 'Outfit', fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(2)}x ROAS`]}
                    labelFormatter={v => `Spend: ₹${(Number(v) / 1000).toFixed(0)}K/mo`}
                    contentStyle={{ fontFamily: 'Outfit', fontSize: 12, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="roas" stroke={chColor} strokeWidth={2} dot={{ r: 3, fill: chColor }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ ...T.helper, fontSize: 12 }}>Insufficient historical data points to render a curve for this channel.</p>
            )}
          </div>

          {/* Seasonality index */}
          <div style={{ ...CARD }}>
            <p style={{ ...T.overline, marginBottom: 16 }}>Monthly seasonality — {selectedChannel}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
              {(expl.seasonalityIndex || []).map((idx, m) => {
                const isPeak  = m === expl.peakMonth;
                const bar     = Math.max(10, Math.min(100, idx * 60));
                return (
                  <div key={m} style={{ textAlign: 'center' }}>
                    <div style={{ height: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <div style={{ width: '100%', backgroundColor: isPeak ? chColor : `${chColor}55`, borderRadius: 4, height: `${bar}%` }} />
                    </div>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: isPeak ? 700 : 400, color: isPeak ? chColor : 'var(--text-muted)', marginTop: 4, margin: '4px 0 0' }}>{MONTH_NAMES[m]}</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, color: 'var(--text-muted)', margin: '2px 0 0' }}>{idx.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
            <p style={{ ...T.helper, fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
              Index 1.0 = channel average. {expl.peakBoost > 0.15
                ? `${MONTH_NAMES[expl.peakMonth]} outperforms the annual average by ~${Math.round(expl.peakBoost * 100)}% — consider front-loading budget in this month.`
                : `Seasonality is near-flat for this channel — timing matters less than allocation share.`}
            </p>
          </div>

          {/* Day-of-week effects */}
          <div style={{ ...CARD }}>
            <p style={{ ...T.overline, marginBottom: 4 }}>Day-of-week performance — {selectedChannel}</p>
            <p style={{ ...T.helper, fontSize: 12, marginBottom: 16 }}>
              Index 1.0 = 7-day average. {expl.weekendBias !== 'neutral'
                ? `This channel is strongest on ${expl.weekendBias === 'weekend' ? 'weekends' : 'weekdays'} — bid strategies can leverage this.`
                : 'Performance is consistent across the week.'}
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              {(expl.dowIndex || []).map((idx, d) => {
                const isBest = d === expl.bestDay;
                const bar    = Math.max(10, Math.min(100, idx * 60));
                return (
                  <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 80, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <div style={{ backgroundColor: isBest ? chColor : `${chColor}44`, borderRadius: 4, height: `${bar}%` }} />
                    </div>
                    <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: isBest ? 700 : 400, color: isBest ? chColor : 'var(--text-muted)', marginTop: 4, margin: '4px 0 0' }}>{DOW_SHORT[d]}</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, color: 'var(--text-muted)', margin: '2px 0 0' }}>{idx.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reason codes */}
          <div style={{ ...CARD }}>
            <p style={{ ...T.overline, marginBottom: 12 }}>Model signal summary — {selectedChannel}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(expl.reasonCodes || []).map(code => (
                <span key={code} style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', padding: '5px 12px', borderRadius: 6 }}>
                  {code}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Data & methodology note ────────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <p style={{ ...T.overline, marginBottom: 10 }}>Methodology notes</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Diminishing returns are modelled using a weighted log-regression: revenue = α·ln(spend+1). Alpha is fitted on monthly observations, weighted by √spend to reduce noise from low-spend months.',
            'Seasonality indices are ROAS ratios per calendar month vs the channel\'s annual average, computed over the full history regardless of the current date filter.',
            'Day-of-week multipliers are ROAS ratios per weekday vs the channel\'s 7-day average, aggregated from all historical daily records.',
            'Optimal allocation solves the KKT conditions: αᵢ·Wᵢ / (xᵢ+1) = λ for all active channels, where Wᵢ is the period time-weight sum. Channels are bounded to prevent extreme concentrations.',
            'Both current and recommended forecasts use the exact same engine — only the allocation shares differ. Uplift is the direct arithmetic difference between the two independently computed revenue totals.',
          ].map((note, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, '0')}.</span>
              <p style={{ ...T.helper, fontSize: 12, lineHeight: 1.6 }}>{note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA → Budget Scenarios ─────────────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            How does the model respond to budget changes?
          </p>
          <p style={{ ...T.helper, fontSize: 12, marginTop: 6 }}>
            Budget Scenarios runs the same engine at different spend levels so you can see diminishing returns at the portfolio level.
          </p>
        </div>
        <Link to="/optimizer/scenarios" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          See Budget Scenarios <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

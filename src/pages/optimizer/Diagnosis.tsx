/**
 * Diagnosis — Page 2 of Mix Optimiser
 *
 * DATA CONTRACT — reads from model:
 *   diagnosis, flaggedChannels, overWeightedChannels, underWeightedChannels,
 *   currentPlan, portfolioROAS, historicalFractions
 *
 * Must NOT read: optimizedPlan, uplift, recommendations
 */
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { OptimizerSubnav } from '@/components/optimizer/OptimizerSubnav';
import { useOptimizerModel } from '@/hooks/useOptimizerModel';
import { formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { CheckCircle, AlertTriangle, TrendingDown, TrendingUp, Minus, ArrowRight } from 'lucide-react';

const T = {
  overline: { fontFamily: 'Outfit' as const, fontSize: 10, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0 },
  helper:   { fontFamily: 'Plus Jakarta Sans' as const, fontSize: 13, fontWeight: 400 as const, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
};
const CARD = { padding: '20px 24px', border: '1px solid var(--border-subtle)', borderRadius: 14, backgroundColor: 'var(--bg-card)' };

const STATUS_META = {
  efficient:      { label: 'Efficient',    color: '#34D399', bg: 'rgba(52,211,153,0.1)',  Icon: CheckCircle },
  saturated:      { label: 'Saturated',    color: '#F87171', bg: 'rgba(248,113,113,0.1)', Icon: TrendingDown },
  'over-scaled':  { label: 'Over-scaled',  color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',  Icon: AlertTriangle },
  'under-scaled': { label: 'Under-scaled', color: '#60A5FA', bg: 'rgba(96,165,250,0.1)',  Icon: TrendingUp },
} as const;

export default function Diagnosis() {
  const {
    isLoading, currentPlan, diagnosis, flaggedChannels,
    overWeightedChannels, underWeightedChannels, portfolioROAS,
  } = useOptimizerModel();

  if (isLoading) return <DashboardSkeleton />;

  const efficientCount    = CHANNELS.filter(ch => diagnosis[ch]?.status === 'efficient').length;
  const saturatedChannels = CHANNELS.filter(ch => diagnosis[ch]?.isSaturated);

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <OptimizerSubnav />

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Diagnosis
        </h1>
        <p style={{ ...T.helper, marginTop: 6 }}>
          What your current mix reveals — channel health, inefficiencies, and where budget is misaligned.
        </p>
        <p style={{ ...T.helper, fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
          This page describes your current allocation only. No AI recommendations are shown here.
        </p>
      </div>

      {/* ── Channel health summary grid ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {CHANNELS.map(ch => {
          const d      = diagnosis[ch];
          const row    = currentPlan.channels[ch];
          const status = (d?.status || 'efficient') as keyof typeof STATUS_META;
          const st     = STATUS_META[status];
          const Icon   = st.Icon;

          return (
            <div key={ch} style={{ padding: '14px 16px', border: `1px solid ${st.color}33`, borderRadius: 12, backgroundColor: 'var(--bg-card)', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} />
                <Icon size={13} color={st.color} />
              </div>
              <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', margin: '6px 0 2px', letterSpacing: '-0.02em' }}>
                {row?.allocationPct?.toFixed(0) ?? 0}%
              </p>
              <p style={{ ...T.helper, fontSize: 10 }}>
                of budget · {(row?.roas || 0).toFixed(2)}x ROAS
              </p>
              <span style={{ display: 'inline-block', marginTop: 8, fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: st.color, backgroundColor: st.bg, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {st.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Summary bar ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Efficient',     count: efficientCount,               color: '#34D399', note: 'Allocation close to model-optimal, healthy marginal return.' },
          { label: 'Saturated',     count: saturatedChannels.length,      color: '#F87171', note: 'Marginal ROAS below breakeven — additional spend yields < ₹1.' },
          { label: 'Over-weighted', count: overWeightedChannels.length,   color: '#FBBF24', note: 'Receiving more than efficiency justifies vs historical baseline.' },
          { label: 'Under-invested', count: underWeightedChannels.length, color: '#60A5FA', note: 'Strong efficiency but allocated less than historical baseline.' },
        ].map(s => (
          <div key={s.label} style={{ ...CARD }}>
            <p style={T.overline}>{s.label}</p>
            <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: s.color, letterSpacing: '-0.02em', margin: '6px 0 0' }}>{s.count}</p>
            <p style={{ ...T.helper, fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{s.note}</p>
            <div style={{ height: 2, backgroundColor: s.color, borderRadius: 1, marginTop: 14, opacity: 0.4 }} />
          </div>
        ))}
      </div>

      {/* ── Flagged channels ──────────────────────────────────────────── */}
      {flaggedChannels.length > 0 && (
        <div style={{ ...CARD }}>
          <p style={{ ...T.overline, marginBottom: 16 }}>Channels requiring attention</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {flaggedChannels.map(ch => {
              const d    = diagnosis[ch];
              const row  = currentPlan.channels[ch];
              const status = (d?.status || 'efficient') as keyof typeof STATUS_META;
              const st   = STATUS_META[status];
              const Icon = st.Icon;

              return (
                <div key={ch} style={{ padding: '14px 16px', backgroundColor: 'var(--bg-root)', borderRadius: 10, border: `1px solid ${st.color}33` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Icon size={15} color={st.color} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }} />
                        <span style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: st.color, backgroundColor: st.bg, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
                          {st.label}
                        </span>
                      </div>
                      <p style={{ ...T.helper, marginTop: 6, fontSize: 13 }}>{d?.explanation}</p>
                      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--text-muted)' }}>Current: <strong style={{ color: 'var(--text-primary)' }}>{(row?.allocationPct || 0).toFixed(0)}%</strong></span>
                        <span style={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--text-muted)' }}>Historical baseline: <strong style={{ color: 'var(--text-primary)' }}>{(d?.historicalPct || 0).toFixed(0)}%</strong></span>
                        <span style={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--text-muted)' }}>ROAS: <strong style={{ color: 'var(--text-primary)' }}>{(d?.historicalROAS || 0).toFixed(2)}x</strong></span>
                        <span style={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--text-muted)' }}>Marginal ROAS: <strong style={{ color: 'var(--text-primary)' }}>{(d?.marginalROAS || 0).toFixed(2)}x</strong></span>
                        <span style={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--text-muted)' }}>Spend: <strong style={{ color: 'var(--text-primary)' }}>{formatINRCompact(row?.periodSpend || 0)}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Over/under-weight summary ─────────────────────────────────── */}
      {(overWeightedChannels.length > 0 || underWeightedChannels.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Over-weighted */}
          <div style={{ ...CARD }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={14} color="#FBBF24" />
              <p style={{ ...T.overline, color: '#FBBF24' }}>Over-weighted vs historical</p>
            </div>
            {overWeightedChannels.length === 0
              ? <p style={{ ...T.helper, fontSize: 12 }}>None.</p>
              : overWeightedChannels.map(ch => {
                const d = diagnosis[ch];
                return (
                  <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                    <span style={{ fontFamily: 'Outfit', fontSize: 12, color: '#FBBF24' }}>
                      +{(d?.deltaPct || 0).toFixed(0)}pp vs hist.
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Under-weighted */}
          <div style={{ ...CARD }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Minus size={14} color="#60A5FA" />
              <p style={{ ...T.overline, color: '#60A5FA' }}>Under-weighted vs historical</p>
            </div>
            {underWeightedChannels.length === 0
              ? <p style={{ ...T.helper, fontSize: 12 }}>None.</p>
              : underWeightedChannels.map(ch => {
                const d = diagnosis[ch];
                return (
                  <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                    <span style={{ fontFamily: 'Outfit', fontSize: 12, color: '#60A5FA' }}>
                      {(d?.deltaPct || 0).toFixed(0)}pp vs hist.
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Risk narrative ────────────────────────────────────────────── */}
      <div style={{ ...CARD }}>
        <p style={{ ...T.overline, marginBottom: 10 }}>Allocation risk overview</p>
        <p style={{ ...T.helper, fontSize: 13, lineHeight: 1.65 }}>
          {flaggedChannels.length === 0
            ? `All 10 channels are in an efficient range relative to the model's current view. Portfolio ROAS is ${portfolioROAS.toFixed(2)}x. Proceed to Recommended Mix to see if a reallocation can still improve the forecast.`
            : `${flaggedChannels.length} channel${flaggedChannels.length > 1 ? 's' : ''} are flagged: ${flaggedChannels.join(', ')}. Portfolio ROAS is ${portfolioROAS.toFixed(2)}x. ` +
              (saturatedChannels.length > 0 ? `${saturatedChannels.join(' and ')} ${saturatedChannels.length > 1 ? 'are' : 'is'} saturated — marginal spend here returns less than ₹1. ` : '') +
              (overWeightedChannels.length > 0 ? `${overWeightedChannels.join(', ')} ${overWeightedChannels.length > 1 ? 'are' : 'is'} receiving more than historical efficiency justifies. ` : '') +
              `The AI recommendation on the next step will quantify the opportunity.`
          }
        </p>
      </div>

      {/* ── CTA → Recommended Mix ─────────────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            See how the model would redistribute your budget.
          </p>
          <p style={{ ...T.helper, fontSize: 12, marginTop: 6 }}>
            Recommended Mix shows the AI-optimised allocation with projected uplift and per-channel rationale.
          </p>
        </div>
        <Link to="/optimizer/recommended" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          See Recommended Mix <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

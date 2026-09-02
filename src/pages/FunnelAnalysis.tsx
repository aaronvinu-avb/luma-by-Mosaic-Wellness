import { useMemo, useState } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import { CHANNELS, CHANNEL_COLORS, MarketingRecord } from '@/lib/mockData';
import { formatINRCompact } from '@/lib/formatCurrency';

interface FunnelMetrics {
  channel: string;
  impressions: number;
  clicks: number;
  conversions: number;
  newCustomers: number;
}

function aggregateMetrics(data: MarketingRecord[], channel?: string): FunnelMetrics {
  const filtered = channel ? data.filter(r => r.channel === channel) : data;
  return filtered.reduce(
    (acc, r) => ({
      channel: channel || 'All Channels',
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      conversions: acc.conversions + r.conversions,
      newCustomers: acc.newCustomers + r.new_customers,
    }),
    { channel: channel || 'All Channels', impressions: 0, clicks: 0, conversions: 0, newCustomers: 0 },
  );
}

const STAGE_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#A78BFA'];

function FunnelStage({ label, value, pctLabel, color, widthPct }: {
  label: string; value: number; pctLabel: string; color: string; widthPct: number;
}) {
  return (
    <div className="flex flex-col items-center w-full">
      <div
        className="rounded-xl flex items-center justify-center py-5 transition-all duration-300"
        style={{
          width: `${widthPct}%`, backgroundColor: color,
          clipPath: 'polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)',
          minHeight: 64, opacity: 0.85,
        }}
      >
        <div className="text-center px-4">
          <p style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: 'var(--bg-root)' }}>
            {value.toLocaleString('en-IN')}
          </p>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'rgba(14,15,15,0.7)', fontWeight: 500 }}>{label}</p>
        </div>
      </div>
      <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{pctLabel}</p>
    </div>
  );
}

export default function FunnelAnalysis() {
  const { data, isLoading } = useMarketingData();
  const [selectedChannel, setSelectedChannel] = useState<string>('');

  const metrics = useMemo(() => (data ? aggregateMetrics(data, selectedChannel || undefined) : null), [data, selectedChannel]);
  const allChannelMetrics = useMemo(() => (data ? CHANNELS.map(ch => aggregateMetrics(data, ch)) : []), [data]);

  if (isLoading) return <DashboardSkeleton />;

  const m = metrics!;
  const stages = [
    { label: 'Impressions', value: m.impressions, pctLabel: '—', widthPct: 100 },
    { label: 'Clicks', value: m.clicks, pctLabel: `CTR ${m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(1) : 0}% of impressions`, widthPct: 78 },
    { label: 'Conversions', value: m.conversions, pctLabel: `Conv Rate ${m.clicks > 0 ? ((m.conversions / m.clicks) * 100).toFixed(1) : 0}% of clicks`, widthPct: 56 },
    { label: 'New Customers', value: m.newCustomers, pctLabel: `${m.conversions > 0 ? ((m.newCustomers / m.conversions) * 100).toFixed(1) : 0}% of conversions`, widthPct: 38 },
  ];

  return (
    <div className="mobile-page funnel-page space-y-6" style={{ maxWidth: 1280 }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
          Traffic Quality Pipeline
        </h1>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
          Impression → click → conversion → new customer. CTR is almost the same on every channel (~3.2%) in this file — treat funnel shape as directional, not live ads.
        </p>
        </div>
        <select
          value={selectedChannel}
          onChange={e => setSelectedChannel(e.target.value)}
          className="rounded-lg px-3 py-2 w-full sm:w-56 focus:outline-none focus:ring-2"
          style={{ border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', backgroundColor: 'var(--bg-root)' }}
        >
          <option value="">All Channels (Combined)</option>
          {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>
      </div>

      <div className="rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)', padding: 24 }}>
        <div className="flex flex-col items-center gap-1 max-w-xl mx-auto">
          {stages.map((s, i) => (
            <FunnelStage key={s.label} {...s} color={STAGE_COLORS[i]} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ padding: '24px 24px 0' }}>
          <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Channel Funnel Comparison</h2>
          <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Channel', 'Impressions', 'Clicks', 'CTR', 'Conversions', 'Conv Rate', 'New Customers'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allChannelMetrics.map((cm, idx) => {
                const ctr = cm.impressions > 0 ? ((cm.clicks / cm.impressions) * 100).toFixed(1) : '0.0';
                const convRate = cm.clicks > 0 ? ((cm.conversions / cm.clicks) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={cm.channel}
                    style={{ backgroundColor: 'transparent', borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-subtle)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    className="transition-colors duration-100"
                  >
                    <td style={{ padding: '13px 16px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      <ChannelName channel={cm.channel} />
                    </td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{cm.impressions.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{cm.clicks.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{ctr}%</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{cm.conversions.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{convRate}%</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{cm.newCustomers.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Methodology Note */}
      <div className="flex items-start gap-2 p-4 rounded-xl mt-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', width: '100%' }}>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Methodology: </span> 
          This pipeline tracks observed traffic progression—from impressions to clicks, conversions, and new customers—by aggregating reported channel metrics. Values are descriptive summaries of tracked performance, not model-estimated journeys.
        </p>
      </div>
    </div>
  );
}

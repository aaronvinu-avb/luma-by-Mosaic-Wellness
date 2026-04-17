import { useMemo } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { 
  getChannelSummaries, 
  getFinancialMetrics, 
  getSimulatedCohort 
} from '@/lib/calculations';
import { formatINR, formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { ChannelName } from '@/components/ChannelName';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Wallet, TrendingUp, Users, Clock, ArrowUpRight, DollarSign, AlertTriangle } from 'lucide-react';

const tooltipStyle = {
  contentStyle: { 
    backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', 
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, boxShadow: 'var(--shadow-sm)' 
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

export default function FinancialInsights() {
  const { data, isLoading } = useMarketingData();

  const summaries = useMemo(() => data ? getChannelSummaries(data) : [], [data]);
  const financials = useMemo(() => getFinancialMetrics(summaries), [summaries]);
  
  const totals = useMemo(() => {
    return financials.reduce((acc, curr) => ({
      spend: acc.spend + curr.spend,
      revenue: acc.revenue + curr.revenue,
      profit: acc.profit + curr.profit,
    }), { spend: 0, revenue: 0, profit: 0 });
  }, [financials]);

  const blendedCAC = useMemo(() => {
    const totalNew = summaries.reduce((s, c) => s + c.newCustomers, 0);
    return totalNew > 0 ? totals.spend / totalNew : 0;
  }, [summaries, totals]);
  const portfolioRoi = totals.spend > 0 ? (totals.profit / totals.spend) * 100 : 0;
  const sortedFinancialsByPayback = useMemo(
    () => [...financials].sort((a, b) => a.paybackDays - b.paybackDays),
    [financials]
  );

  const cohortData = useMemo(() => {
    // Generate combined cohort data for top 5 channels
    const targetChannels = financials
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(f => f.channel);
      
    // Create a 2D array for the heatmap (Weeks 0-12 x Channel)
    return targetChannels.map(ch => ({
      channel: ch,
      data: getSimulatedCohort(ch, 100) // 100% basis for normalized heatmap
    }));
  }, [financials]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="mobile-page financial-page space-y-8" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Financial Performance
        </h1>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
          Measuring the bottom-line efficiency of every marketing rupee. 
          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
            (Note: LTV assumes a 60% gross margin and 3.5x avg purchase frequency per customer)
          </span>
        </p>
      </div>

      {/* Observed Section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 4, height: 20, backgroundColor: 'var(--text-secondary)', borderRadius: 2 }} />
          <h2 style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Observed Performance (Historical)</h2>
        </div>
        <div className="financial-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {[
            { label: 'Total Spend', value: formatINRCompact(totals.spend), sub: 'Actual historical deployment', icon: Wallet, color: '#60A5FA' },
            { label: 'Blended CAC', value: formatINR(blendedCAC), sub: 'Effective cost per customer', icon: Users, color: '#FBBF24' },
          ].map((s, i) => (
            <div key={`obs-${i}`} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: `${s.color}15` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              </div>
              <p style={{ fontFamily: 'Outfit', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{s.value}</p>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pro Forma Section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 4, height: 20, backgroundColor: '#E8803A', borderRadius: 2 }} />
          <h2 style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#E8803A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pro Forma Projections (Estimated)</h2>
        </div>
        <div className="financial-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Net Contribution', value: formatINRCompact(totals.profit), sub: 'Modeled post-marketing profit', icon: TrendingUp, color: '#34D399' },
            { label: 'Portfolio ROI', value: `${portfolioRoi.toFixed(1)}%`, sub: 'Efficiency multiplier', icon: ArrowUpRight, color: '#E8803A' },
          ].map((s, i) => (
            <div key={`est-${i}`} style={{ backgroundColor: 'rgba(232, 128, 58, 0.03)', border: '1px dashed rgba(232, 128, 58, 0.3)', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: `${s.color}15` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: '#E8803A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              </div>
              <p style={{ fontFamily: 'Outfit', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{s.value}</p>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: 'rgba(232, 128, 58, 0.02)', border: '1px solid var(--border-strong)', borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Estimated Channel Economics</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }}>Calculated using LTV multipliers</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-root)' }}>
                  {['Channel', 'Spend', 'Net Profit', 'CAC', 'LTV:CAC'].map(h => (
                    <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financials.map((f, i) => {
                  const ltvCac = f.cac > 0 ? f.ltv / f.cac : 0;
                  return (
                    <tr key={f.channel} style={{ borderBottom: i === financials.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 20px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        <ChannelName channel={f.channel} />
                      </td>
                      <td style={{ padding: '14px 20px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)' }}>{formatINRCompact(f.spend)}</td>
                      <td style={{ padding: '14px 20px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600, color: f.profit > 0 ? '#34D399' : '#F87171' }}>{formatINRCompact(f.profit)}</td>
                      <td style={{ padding: '14px 20px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-primary)' }}>{formatINR(f.cac)}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 700, color: ltvCac > 3 ? '#34D399' : ltvCac > 2 ? '#FBBF24' : '#F87171' }}>
                            {ltvCac.toFixed(1)}x
                          </span>
                          <div style={{ flex: 1, height: 4, width: 60, backgroundColor: 'var(--border-subtle)', borderRadius: 2 }}>
                            <div style={{ 
                              height: '100%', 
                              width: `${Math.min(100, (ltvCac / 5) * 100)}%`, 
                              backgroundColor: ltvCac > 3 ? '#34D399' : ltvCac > 2 ? '#FBBF24' : '#F87171',
                              borderRadius: 2
                            }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* LTV & Payback Card */}
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(232, 128, 58, 0.1)' }}>
              <Clock size={16} style={{ color: '#E8803A' }} />
            </div>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Payback Analysis (Days)</h2>
          </div>
          
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sortedFinancialsByPayback} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="channel" 
                tick={{ fontSize: 11, fill: 'var(--text-primary)', fontFamily: 'Outfit' }} 
                width={100} 
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                {...tooltipStyle} 
                formatter={(v: number) => [`${v} days`, 'Est. Payback']}
              />
              <Bar dataKey="paybackDays" radius={[0, 4, 4, 0]} barSize={16}>
                {sortedFinancialsByPayback.map((entry, index) => (
                  <Cell key={index} fill={entry.paybackDays < 60 ? '#34D399' : entry.paybackDays < 120 ? '#FBBF24' : '#F87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          
          <div style={{ marginTop: 20, padding: 16, borderRadius: 12, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Payback Period:</span> The estimated time required for a new customer's contribution profit to cover their acquisition cost. Target threshold is &lt; 90 days.
            </p>
          </div>
        </div>
      </section>

      {/* Cohort Retention Analysis */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 24, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} style={{ color: '#FBBF24' }} />
              Simulated Cohort Revenue Retention
            </h2>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Tracking long-term revenue decay normalized by channel acquisition profile.
            </p>
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Normalized Week 0 = 100%</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 8 }}>
          {/* Header Row */}
          <div style={{ gridColumn: 'span 1' }} />
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ textAlign: 'center', fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
              Wk {i+1}
            </div>
          ))}

          {/* Data Rows */}
          {cohortData.map((cd, ri) => (
            <div key={ri} style={{ display: 'contents' }}>
              <div style={{ gridColumn: 'span 1', display: 'flex', alignItems: 'center', padding: '12px 0' }}>
                <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{cd.channel}</span>
              </div>
              {cd.data.slice(1).map((point, ci) => {
                const opacity = point.retention / 100;
                return (
                  <div 
                    key={ci} 
                    style={{ 
                      aspectRatio: '1', 
                      borderRadius: 6, 
                      backgroundColor: `rgba(232, 128, 58, ${opacity})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 9, fontWeight: 700, color: opacity > 0.4 ? '#fff' : 'var(--text-primary)' }}>
                      {Math.round(point.retention)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        
        <div style={{ marginTop: 32, padding: '16px 20px', borderRadius: 16, backgroundColor: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(52, 211, 153, 0.1)' }}>
            <TrendingUp size={20} style={{ color: '#34D399' }} />
          </div>
          <div>
            <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Financial Insight: High-Retention Channels</p>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Email and SMS show the slowest decay rates, contributing disproportionately to long-term LTV. Increasing acquisition budget for these channels may lower short-term ROAS but will significantly improve 12-month profitability.
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 p-4 rounded-xl mt-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', width: '100%' }}>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Methodology: </span> 
          LTV and Net Contribution are pro forma estimates based on a 60% gross margin assumption and trailing 12-month average purchase frequency. CAC and Spend are observed historical values. Predictive indices are scenario-based and intended for directional guidance.
        </p>
      </div>
    </div>
  );
}

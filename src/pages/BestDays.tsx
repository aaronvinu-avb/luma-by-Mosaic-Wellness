import { useMemo } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import { formatINRCompact } from '@/lib/formatCurrency';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function BestDays() {
  const { data, isLoading } = useMarketingData();

  const { bestDays, worstDays, bestDow, bestMonth, bestChannelOnPeaks } = useMemo(() => {
    if (!data) return { bestDays: [], worstDays: [], bestDow: '', bestMonth: '', bestChannelOnPeaks: '' };

    const byDate: Record<string, { revenue: number; spend: number }> = {};
    data.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { revenue: 0, spend: 0 };
      byDate[r.date].revenue += r.revenue;
      byDate[r.date].spend += r.spend;
    });

    const days = Object.entries(byDate).map(([date, v]) => ({
      date, revenue: v.revenue, spend: v.spend, roas: v.spend > 0 ? v.revenue / v.spend : 0,
      dow: DAYS[new Date(date).getDay()],
    })).sort((a, b) => b.revenue - a.revenue);

    const bestDays = days.slice(0, 10);
    const worstDays = days.slice(-10).reverse();

    const dowStats: Record<string, { rev: number; spend: number; count: number }> = {};
    days.forEach(d => {
      if (!dowStats[d.dow]) dowStats[d.dow] = { rev: 0, spend: 0, count: 0 };
      dowStats[d.dow].rev += d.revenue;
      dowStats[d.dow].spend += d.spend;
      dowStats[d.dow].count++;
    });
    const safeRoas = (rev: number, spend: number) => (spend > 0 ? rev / spend : 0);
    const bestDowEntry = Object.entries(dowStats).sort((a, b) => safeRoas(b[1].rev, b[1].spend) - safeRoas(a[1].rev, a[1].spend))[0];
    const bestDow = bestDowEntry ? `${bestDowEntry[0]} · ${safeRoas(bestDowEntry[1].rev, bestDowEntry[1].spend).toFixed(1)}x ROAS` : '';

    const monthStats: Record<string, { rev: number; count: number }> = {};
    days.forEach(d => {
      const m = MONTHS[new Date(d.date).getMonth()];
      if (!monthStats[m]) monthStats[m] = { rev: 0, count: 0 };
      monthStats[m].rev += d.revenue;
      monthStats[m].count++;
    });
    const bestMonthEntry = Object.entries(monthStats).sort((a, b) => b[1].rev - a[1].rev)[0];
    const bestMonth = bestMonthEntry ? `${bestMonthEntry[0]} · ${formatINRCompact(bestMonthEntry[1].rev)} total` : '';

    const peakDates = new Set(bestDays.map(d => d.date));
    const chRevOnPeaks: Record<string, number> = {};
    data.filter(r => peakDates.has(r.date)).forEach(r => {
      chRevOnPeaks[r.channel] = (chRevOnPeaks[r.channel] || 0) + r.revenue;
    });
    const bestChannelOnPeaks = Object.entries(chRevOnPeaks).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    return { bestDays, worstDays, bestDow, bestMonth, bestChannelOnPeaks };
  }, [data]);

  if (isLoading) return <DashboardSkeleton />;

  const renderTable = (title: string, rows: typeof bestDays, highlightColor: string) => (
    <div style={{ flex: 1, backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <p style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Date', 'Day', 'Revenue', 'ROAS'].map(h => (
              <th key={h} style={{
                fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 14px',
                textAlign: 'left', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{
              backgroundColor: i === 0 ? highlightColor : 'transparent',
              borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <td style={{ padding: '10px 14px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{i + 1}</td>
              <td style={{ padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-primary)' }}>
                {new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </td>
              <td style={{ padding: '10px 14px' }}>
                <span style={{
                  fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-secondary)', backgroundColor: 'var(--border-subtle)',
                  padding: '3px 10px', borderRadius: 999,
                }}>{row.dow}</span>
              </td>
              <td style={{ padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-primary)' }}>{formatINRCompact(row.revenue)}</td>
              <td style={{ padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: '#FB923C', fontWeight: 600 }}>{row.roas.toFixed(1)}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const [bestDowName = '—', bestDowDetail = ''] = bestDow ? bestDow.split(' · ') : ['—', ''];
  const [bestMonthName = '—', bestMonthDetail = ''] = bestMonth ? bestMonth.split(' · ') : ['—', ''];

  const insights = [
    { label: 'Best Day of Week', value: bestDowName, sub: bestDowDetail },
    { label: 'Best Month', value: bestMonthName, sub: bestMonthDetail },
    { label: 'Best Channel on Peak Days', value: bestChannelOnPeaks, sub: 'highest revenue on top 10 days' },
  ];

  return (
    <div className="mobile-page bestdays-page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Best Days</h1>
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Your highest performing days across 3 years</p>
      </div>

      <div className="bestdays-tables" style={{ display: 'flex', gap: 16 }}>
        {renderTable('Top 10 Best Days', bestDays, 'rgba(232,118,58,0.1)')}
        {renderTable('Worst 10 Days', worstDays, 'rgba(248,113,113,0.1)')}
      </div>

      <div className="bestdays-insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ backgroundColor: 'var(--bg-card)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{ins.label}</p>
            <p style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px', letterSpacing: '-0.02em' }}>
              {ins.label === 'Best Channel on Peak Days' ? <ChannelName channel={ins.value} style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }} /> : ins.value}
            </p>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{ins.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import {
  getChannelSummaries,
  getChannelSaturationModels,
  getOptimalAllocationNonLinear,
  getSeasonalityMetrics,
  getDayOfWeekMetrics,
  generateChannelInsights,
  getMarginalROASCurve,
  projectRevenue,
  computeScenarios,
  getTimeFrameMonths,
} from '@/lib/calculations';
import {
  Sliders,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Download,
  Circle,
  Scissors,
  Pause,
  Clock,
  AlertTriangle,
  Sparkles
} from "lucide-react";

import { formatINR, formatINRCompact } from '@/lib/formatCurrency';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/mockData';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line, ReferenceLine,
} from 'recharts';
import { exportToCSV } from '@/lib/exportData';

const BUDGET_SCENARIOS = [
  { label: 'Conservative ₹30L', value: 3000000, color: '#60A5FA' },
  { label: 'Current ₹50L', value: 5000000, color: '#FBBF24' },
  { label: 'Aggressive ₹75L', value: 7500000, color: '#34D399' },
];

const PRIORITY_COLORS = { high: '#F87171', medium: '#FBBF24', low: '#60A5FA' };
const PRIORITY_BG = { high: 'rgba(248,113,113,0.08)', medium: 'rgba(251,191,36,0.08)', low: 'rgba(96,165,250,0.08)' };
const TYPE_ICONS = { 
  boost: TrendingUp, 
  cut: Scissors, 
  pause: Pause, 
  timing: Clock, 
  saturated: AlertTriangle 
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, boxShadow: 'var(--shadow-sm)'
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

export default function MixOptimizer() {
  const { data, aggregate, globalAggregate, isLoading } = useMarketingData();
  const [budget, setBudget] = useState(5000000);
  const [hasSetInitialBudget, setHasSetInitialBudget] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const [activePill, setActivePill] = useState(1);
  const [selectedChannel, setSelectedChannel] = useState<string>(CHANNELS[0]);
  const [activeTab, setActiveTab] = useState<'optimizer' | 'insights' | 'curves'>('optimizer');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0..11

  // ── Data derivations ──────────────────────────────────────────────────────
  const summaries = useMemo(() => (aggregate || data) ? getChannelSummaries(aggregate || data!) : [], [data, aggregate]);
  const models = useMemo(() => (globalAggregate || data) ? getChannelSaturationModels(globalAggregate || data!) : [], [data, globalAggregate]);
  const seasonality = useMemo(() => (globalAggregate || data) ? getSeasonalityMetrics(globalAggregate || data!) : [], [data, globalAggregate]);
  const dowMetrics = useMemo(() => (aggregate || data) ? getDayOfWeekMetrics(aggregate || data!) : [], [data, aggregate]);
  const timeFrameMonths = useMemo(() => getTimeFrameMonths(aggregate || data || []), [aggregate, data]);

  const avgMonthlySpend = useMemo(() => {
    if (summaries.length === 0) return 5000000;
    const totalSpend = summaries.reduce((s, ch) => s + ch.totalSpend, 0);
    return Math.round(totalSpend / (timeFrameMonths || 1));
  }, [summaries, timeFrameMonths]);

  useEffect(() => {
    if (avgMonthlySpend !== 5000000 && !hasSetInitialBudget) {
      setBudget(avgMonthlySpend);
      setHasSetInitialBudget(true);
    }
  }, [avgMonthlySpend, hasSetInitialBudget]);

  const roasMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of summaries) m[s.channel] = s.roas;
    return m;
  }, [summaries]);

  const monthMultipliers = useMemo(() => {
    const mults: Record<string, number> = {};
    for (const ch of CHANNELS) {
      const sea = (seasonality || []).find(s => s.channel === ch);
      mults[ch] = sea?.monthlyIndex?.[selectedMonth] ?? 1.0;
    }
    return mults;
  }, [seasonality, selectedMonth]);

  // Initial equal split
  const alloc = useMemo(() => {
    if (Object.keys(allocations).length > 0) return allocations;
    const eq: Record<string, number> = {};
    CHANNELS.forEach(ch => (eq[ch] = 0.1));
    return eq;
  }, [allocations]);

  const activeChannels = CHANNELS.filter(ch => !paused.has(ch));

  // Effective alloc redistributes paused channels' share among active
  const effectiveAlloc = useMemo(() => {
    const eff: Record<string, number> = {};
    const pausedTotal = CHANNELS.filter(ch => paused.has(ch)).reduce((s, ch) => s + (alloc[ch] || 0), 0);
    const activeTotal = activeChannels.reduce((s, ch) => s + (alloc[ch] || 0), 0);
    for (const ch of CHANNELS) {
      if (paused.has(ch)) { eff[ch] = 0; continue; }
      eff[ch] = activeTotal > 0 ? (alloc[ch] || 0) / activeTotal * (activeTotal + pausedTotal) : 0;
    }
    const sum = Object.values(eff).reduce((s, v) => s + v, 0);
    if (sum > 0) for (const k of Object.keys(eff)) eff[k] = eff[k] / sum;
    return eff;
  }, [alloc, paused, activeChannels]);

  // Optimal fractions via non-linear model (Context-Aware)
  const optimalFractions = useMemo(() =>
    models.length > 0 ? getOptimalAllocationNonLinear(models, budget, paused, monthMultipliers) : {},
  [models, budget, paused, monthMultipliers]);

  // Pre-computed scenario projections (Context-Aware)
  const scenarioResults = useMemo(() =>
    models.length > 0
      ? computeScenarios(models, BUDGET_SCENARIOS.map(s => s.value), paused, monthMultipliers)
      : BUDGET_SCENARIOS.map(s => ({ budget: s.value, revenue: 0, roas: 0, fractions: {} })),
  [models, paused, monthMultipliers]);

  // ── Projections using log model (Context-Aware) ───────────────────────────
  const projectedRevenue = useMemo(() => {
    if (models.length === 0) return 0;
    return CHANNELS.reduce((s, ch) => {
      const model = models.find(m => m.channel === ch);
      if (!model) return s;
      const mult = monthMultipliers[ch] || 1.0;
      return s + projectRevenue(model, (effectiveAlloc[ch] || 0) * budget, mult);
    }, 0);
  }, [effectiveAlloc, budget, models, monthMultipliers]);

  const projectedROAS = budget > 0 ? projectedRevenue / budget : 0;

  const optimalRevenue = useMemo(() => {
    if (models.length === 0) return 0;
    return CHANNELS.reduce((s, ch) => {
      const model = models.find(m => m.channel === ch);
      if (!model) return s;
      const mult = monthMultipliers[ch] || 1.0;
      return s + projectRevenue(model, (optimalFractions[ch] || 0) * budget, mult);
    }, 0);
  }, [optimalFractions, budget, models, monthMultipliers]);

  const revenueGap = Math.max(0, optimalRevenue - projectedRevenue);
  const totalPct = useMemo(() => CHANNELS.reduce((s, ch) => s + (alloc[ch] || 0), 0), [alloc]);

  // ── Insight generation ────────────────────────────────────────────────────
  const insights = useMemo(() =>
    summaries.length > 0 && models.length > 0
      ? generateChannelInsights(summaries, models, seasonality, dowMetrics, budget, optimalFractions, effectiveAlloc)
      : [],
  [summaries, models, seasonality, dowMetrics, budget, optimalFractions, effectiveAlloc]);

  // ── Marginal ROAS curve for selected channel ──────────────────────────────
  const marginalCurveData = useMemo(() => {
    const model = models.find(m => m.channel === selectedChannel);
    if (!model) return [];
    const currentSpend = (effectiveAlloc[selectedChannel] || 0) * budget;
    return getMarginalROASCurve(model, Math.max(currentSpend * 2, 3000000), 40);
  }, [models, selectedChannel, effectiveAlloc, budget]);

  const currentChannelSpend = (effectiveAlloc[selectedChannel] || 0) * budget;

  // ── Comparison bar chart data ─────────────────────────────────────────────
  const comparisonData = useMemo(() =>
    CHANNELS.map(ch => ({
      channel: ch.replace(' ', '\n'),
      current: parseFloat(((effectiveAlloc[ch] || 0) * 100).toFixed(1)),
      optimal: parseFloat(((optimalFractions[ch] || 0) * 100).toFixed(1)),
    })),
  [effectiveAlloc, optimalFractions]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSlider = useCallback((ch: string, val: number[]) => {
    setAllocations(prev => ({ ...prev, [ch]: val[0] / 100 }));
  }, []);

  const resetToCurrent = () => {
    const eq: Record<string, number> = {};
    CHANNELS.forEach(ch => (eq[ch] = 0.1));
    setAllocations(eq);
    setPaused(new Set());
  };

  const applyOptimal = () => {
    setAllocations({ ...optimalFractions });
    setPaused(new Set());
  };

  const togglePause = (ch: string) => {
    const next = new Set(paused);
    if (next.has(ch)) next.delete(ch); else next.add(ch);
    setPaused(next);
  };

  if (isLoading) return <DashboardSkeleton />;

  // ── Styles ────────────────────────────────────────────────────────────────
  const pillStyle = (active: boolean) => ({
    fontFamily: 'Plus Jakarta Sans' as const, fontSize: 12, fontWeight: 500 as const,
    padding: '5px 12px', borderRadius: 6, cursor: 'pointer' as const, transition: '150ms',
    backgroundColor: active ? 'var(--bg-card)' : 'var(--border-subtle)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    border: active ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
  });

  const tabStyle = (active: boolean) => ({
    fontFamily: 'Outfit' as const, fontSize: 13, fontWeight: 600 as const,
    padding: '8px 20px', borderRadius: 8, cursor: 'pointer' as const, transition: '150ms',
    backgroundColor: active ? '#E8803A' : 'var(--border-subtle)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: 'none',
  });

  return (
    <div className="space-y-6" style={{ maxWidth: 1320 }}>
      {/* Header with Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            Marketing Mix Optimizer
          </h1>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 12 }}>AI-powered budget allocation & revenue forecasting</p>
        </div>
        <button 
          onClick={() => exportToCSV(CHANNELS.map(ch => ({
            Channel: ch,
            'Current Allocation (%)': ((allocations[ch] || 0) * 100).toFixed(1),
            'AI Optimal Allocation (%)': ((optimalFractions[ch] || 0) * 100).toFixed(1),
            'Current Spend': ((allocations[ch] || 0) * budget).toFixed(0),
            'Optimal Spend': ((optimalFractions[ch] || 0) * budget).toFixed(0),
            'Current Revenue': projectRevenue(models.find(m => m.channel === ch)!, (allocations[ch] || 0) * budget, monthMultipliers[ch] || 1.0).toFixed(0),
            'Optimal Revenue': projectRevenue(models.find(m => m.channel === ch)!, (optimalFractions[ch] || 0) * budget, monthMultipliers[ch] || 1.0).toFixed(0)
          })), 'Pulse_Marketing_Mix_Optimization')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95"
          style={{ 
            backgroundColor: 'var(--bg-card)', 
            border: '1px solid var(--border-strong)', 
            color: 'var(--text-primary)',
            fontFamily: 'Outfit',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer'
          }}
        >
          <Download size={16} />
          Export Optimization
        </button>
      </div>

      {/* Temporal Context Selector */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <p style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          Planning Context:
        </p>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
            <button
              key={m}
              onClick={() => setSelectedMonth(i)}
              style={{
                fontFamily: 'Plus Jakarta Sans',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 6,
                border: selectedMonth === i ? '1px solid var(--border-strong)' : '1px solid transparent',
                backgroundColor: selectedMonth === i ? 'var(--border-subtle)' : 'transparent',
                color: selectedMonth === i ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: '150ms'
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Budget selectors ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {BUDGET_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => { setBudget(s.value); setActivePill(i); }} style={pillStyle(activePill === i)} className="flex items-center gap-2">
            <Circle size={8} fill={s.color} stroke="none" />
            {s.label}
          </button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 14px' }}>
          <span style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>₹</span>
          <input
            type="number" value={budget}
            onChange={e => { setBudget(Number(e.target.value)); setActivePill(-1); }}
            style={{ width: 120, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Plus Jakarta Sans', fontSize: 14, color: 'var(--text-primary)' }}
          />
          <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)' }}>({formatINRCompact(budget)})</span>
        </div>
      </div>

      {/* ── Revenue gap banner ── */}
      {revenueGap > 5000 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0.04))', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 14, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Revenue Opportunity</p>
            <p style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, color: '#34D399', letterSpacing: '-0.025em', marginTop: 4 }}>
              You're leaving {formatINR(Math.round(revenueGap))} on the table this month
            </p>
          </div>
          <button onClick={applyOptimal} style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 10, background: 'linear-gradient(135deg, #34D399, #2DD4BF)', color: 'var(--bg-root)', border: 'none', cursor: 'pointer' }}>
            Apply AI Recommendation →
          </button>
        </div>
      )}

      {/* ── Top KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Projected Revenue', value: formatINRCompact(projectedRevenue), color: 'var(--text-primary)', accent: '#34D399' },
          { label: 'Projected ROAS', value: `${projectedROAS.toFixed(2)}x`, color: '#E8803A', accent: '#E8803A' },
          { label: 'Optimal Revenue', value: formatINRCompact(optimalRevenue), color: 'var(--text-primary)', accent: '#A78BFA' },
          { label: 'Active Channels', value: `${activeChannels.length} / 10`, color: 'var(--text-primary)', accent: '#60A5FA' },
        ].map(kpi => (
          <div key={kpi.label} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '18px 20px' }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{kpi.label}</p>
            <p style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: kpi.color, letterSpacing: '-0.03em', marginTop: 6 }}>{kpi.value}</p>
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: 12, opacity: 0.4 }} />
          </div>
        ))}
      </div>

      {/* ── Tab navigation ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="flex items-center gap-2" style={tabStyle(activeTab === 'optimizer')} onClick={() => setActiveTab('optimizer')}><Sliders size={14}/> Optimizer</button>
        <button className="flex items-center gap-2" style={tabStyle(activeTab === 'insights')} onClick={() => setActiveTab('insights')}><Lightbulb size={14}/> AI Insights ({insights.length})</button>
        <button className="flex items-center gap-2" style={tabStyle(activeTab === 'curves')} onClick={() => setActiveTab('curves')}><TrendingDown size={14}/> Diminishing Returns</button>
      </div>

      {/* ════════════════ OPTIMIZER TAB ════════════════ */}
      {activeTab === 'optimizer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Sliders */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Manual Allocation</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={resetToCurrent} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 8, backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)', cursor: 'pointer' }}>Reset</button>
                <button onClick={applyOptimal} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: 'var(--bg-root)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(232,128,58,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  AI Recommendation <Sparkles size={12} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CHANNELS.map((ch, ci) => {
                const pct = Math.round((alloc[ch] || 0) * 100);
                const amt = (effectiveAlloc[ch] || 0) * budget;
                const model = models.find(m => m.channel === ch);
                const projRev = model ? projectRevenue(model, amt) : amt * (roasMap[ch] || 0);
                const optPct = Math.round((optimalFractions[ch] || 0) * 100);
                const isPaused = paused.has(ch);
                const color = CHANNEL_COLORS[ci];
                const delta = optPct - pct;

                return (
                  <div key={ch} style={{ opacity: isPaused ? 0.4 : 1, border: '1px solid var(--border-strong)', borderRadius: 12, padding: '12px 14px', backgroundColor: 'var(--bg-root)', transition: 'opacity 200ms' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                        <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {delta !== 0 && !isPaused && (
                          <span style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: delta > 0 ? '#34D399' : '#F87171', backgroundColor: delta > 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                            AI: {delta > 0 ? '+' : ''}{delta}%
                          </span>
                        )}
                        <span style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                        <Switch checked={!isPaused} onCheckedChange={() => togglePause(ch)} />
                      </div>
                    </div>
                    <Slider value={[pct]} min={0} max={60} step={1} onValueChange={v => handleSlider(ch, v)} disabled={isPaused} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)' }}>{formatINRCompact(amt)} spend</span>
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: color }}>→ {formatINRCompact(projRev)} rev</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, marginTop: 12, backgroundColor: Math.abs(totalPct - 1) > 0.01 ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)', color: Math.abs(totalPct - 1) > 0.01 ? '#F87171' : '#34D399', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600 }}>
              Total: {Math.round(totalPct * 100)}%
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Current vs Optimal */}
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Current vs Optimal Allocation</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={comparisonData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
                  <XAxis dataKey="channel" tick={{ fontSize: 8, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]} />
                  <Legend wrapperStyle={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }} />
                  <Bar dataKey="current" fill="rgba(96,165,250,0.6)" name="Your Allocation" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="optimal" fill="rgba(232,128,58,0.85)" name="AI Optimal" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Budget Scenarios — uses pre-computed scenarioResults */}
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 0' }}>
                <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Budget Scenarios (non-linear model)</h2>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-card)' }}>
                    {['Budget', 'Proj. Revenue', 'ROAS', 'vs ₹50L'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BUDGET_SCENARIOS.map((s, i) => {
                    const sr = scenarioResults[i] || { revenue: 0, roas: 0 };
                    const baseline = scenarioResults[1]?.revenue || 0; // ₹50L baseline
                    const diff = sr.revenue - baseline;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                        <td style={{ padding: '12px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINRCompact(s.value)}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{formatINRCompact(sr.revenue)}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: sr.roas >= 4 ? '#34D399' : sr.roas >= 2 ? '#FBBF24' : '#F87171' }}>{sr.roas.toFixed(2)}x</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: diff >= 0 ? '#34D399' : '#F87171' }}>
                          {diff >= 0 ? '+' : ''}{formatINRCompact(Math.abs(diff))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* AI Allocation Roadmap Summary Table */}
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 0' }}>
                <h2 style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  AI Allocation Roadmap (%)
                </h2>
                <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Comparing optimal % mix across budget tiers
                </p>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(232,128,58,0.03)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Channel</th>
                    {BUDGET_SCENARIOS.map(s => (
                      <th key={s.label} style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        {s.value/100000}L
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CHANNELS.map((ch, idx) => (
                    <tr key={ch} style={{ borderBottom: idx === CHANNELS.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <ChannelName channel={ch} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }} />
                      </td>
                      {scenarioResults.map((sr, si) => {
                        const pct = (sr.fractions[ch] || 0) * 100;
                        const baselinePct = (scenarioResults[1]?.fractions[ch] || 0) * 100;
                        const isPrimary = pct > 15;
                        return (
                          <td key={si} style={{ 
                            padding: '10px 16px', 
                            textAlign: 'right', 
                            fontFamily: 'Plus Jakarta Sans', 
                            fontSize: 12, 
                            fontWeight: 500,
                            color: isPrimary ? 'var(--text-primary)' : 'var(--text-muted)',
                            backgroundColor: pct > baselinePct + 2 ? 'rgba(52, 211, 153, 0.05)' : 'transparent'
                          }}>
                            {pct.toFixed(1)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--border-subtle)', borderTop: '1px solid var(--border-strong)' }}>
                <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                  Model automatically diversifies as core channels hit saturation limits.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ INSIGHTS TAB ════════════════ */}
      {activeTab === 'insights' && (
        <div>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Based on the non-linear model, seasonality analysis, and day-of-week patterns. Sorted by priority.
          </p>
          {insights.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }}>Loading insights…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ backgroundColor: PRIORITY_BG[ins.priority], border: `1px solid ${PRIORITY_COLORS[ins.priority]}30`, borderLeft: `3px solid ${PRIORITY_COLORS[ins.priority]}`, borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(() => {
                        const Icon = TYPE_ICONS[ins.type as keyof typeof TYPE_ICONS] || Lightbulb;
                        return <Icon size={16} style={{ color: PRIORITY_COLORS[ins.priority] }} />;
                      })()}
                      <p style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{ins.headline}</p>
                    </div>
                    <span style={{ flexShrink: 0, fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: PRIORITY_COLORS[ins.priority], backgroundColor: `${PRIORITY_COLORS[ins.priority]}18`, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {ins.priority}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ins.rationale}</p>
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: CHANNEL_COLORS[CHANNELS.indexOf(ins.channel)] || 'var(--text-muted)' }} />
                    <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)' }}>{ins.channel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ DIMINISHING RETURNS TAB ════════════════ */}
      {activeTab === 'curves' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
          {/* Channel picker */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Select Channel</p>
            {CHANNELS.map((ch, ci) => {
              const isActive = selectedChannel === ch;
              const model = models.find(m => m.channel === ch);
              const color = CHANNEL_COLORS[ci];
              return (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, border: isActive ? `1px solid ${color}40` : '1px solid transparent', backgroundColor: isActive ? `${color}10` : 'transparent', cursor: 'pointer', textAlign: 'left', transition: '120ms' }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1 }}>{ch}</span>
                  {model && (
                    <span style={{ fontFamily: 'Outfit', fontSize: 10, color: color, fontWeight: 600 }}>
                      α={model.alpha.toFixed(0)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Curve chart */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 24 }}>
            {(() => {
              const model = models.find(m => m.channel === selectedChannel);
              const color = CHANNEL_COLORS[CHANNELS.indexOf(selectedChannel)];
              const summary = summaries.find(s => s.channel === selectedChannel);
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedChannel} — Diminishing Returns</h2>
                      <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Marginal ROAS curve: at what spend level does each additional ₹ stop being worth it?
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        { label: 'Historical ROAS', value: summary ? `${summary.roas.toFixed(2)}x` : '—' },
                        { label: 'Saturation Point', value: model ? formatINRCompact(model.saturationPoint) : '—' },
                        { label: 'Current Spend', value: formatINRCompact(currentChannelSpend) },
                        { label: 'Marg. ROAS Now', value: model ? `${(model.alpha / (currentChannelSpend + 1)).toFixed(2)}x` : '—' },
                      ].map(kpi => (
                        <div key={kpi.label} style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border-strong)' }}>
                          <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{kpi.label}</p>
                          <p style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color, marginTop: 2 }}>{kpi.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={marginalCurveData}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
                      <XAxis
                        dataKey="spend"
                        tickFormatter={v => formatINRCompact(v)}
                        tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }}
                        axisLine={false} tickLine={false}
                        label={{ value: 'Monthly Spend →', position: 'insideBottom', offset: -4, style: { fill: 'var(--text-muted)', fontSize: 11 } }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                        axisLine={false} tickLine={false}
                        label={{ value: 'ROAS', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 11 } }}
                      />
                      <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`${v.toFixed(2)}x`, name]} labelFormatter={v => `Spend: ${formatINRCompact(Number(v))}`} />
                      <ReferenceLine y={1} stroke="#F87171" strokeDasharray="4 4" label={{ value: 'Breakeven ROAS = 1x', position: 'insideRight', style: { fill: '#F87171', fontSize: 10 } }} />
                      <ReferenceLine x={currentChannelSpend} stroke="#FBBF24" strokeDasharray="4 4" label={{ value: 'Current', position: 'top', style: { fill: '#FBBF24', fontSize: 10 } }} />
                      <Legend wrapperStyle={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-secondary)' }} />
                      <Line type="monotone" dataKey="marginalROAS" stroke={color} strokeWidth={2.5} dot={false} name="Marginal ROAS" />
                      <Line type="monotone" dataKey="avgROAS" stroke={`${color}60`} strokeWidth={1.5} dot={false} name="Average ROAS" strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>

                  <div style={{ marginTop: 16, padding: '12px 16px', backgroundColor: 'var(--bg-root)', borderRadius: 10, border: '1px solid var(--border-strong)' }}>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Reading this chart: </strong>
                      The <span style={{ color }}>Marginal ROAS</span> line shows how much revenue each additional ₹1 of spend generates at that level.
                      When it crosses the <span style={{ color: '#F87171' }}>breakeven line (1x)</span>, you're spending more than you earn on the margin.
                      The <span style={{ color: '#FBBF24' }}>yellow marker</span> shows your current spend allocation.
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Footer Methodology Note */}
      <div className="flex items-start gap-2 p-4 rounded-xl mt-8" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', width: '100%' }}>
        <Lightbulb size={16} style={{ color: '#FBBF24', marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Methodology: </span> 
          This tool analyzes historical channel data to identify diminishing returns. It recommends shifting budget toward the channels projected to deliver the highest incremental revenue. These allocations are predictive estimates designed for planning, not guaranteed outcomes.
        </p>
      </div>
    </div>
  );
}

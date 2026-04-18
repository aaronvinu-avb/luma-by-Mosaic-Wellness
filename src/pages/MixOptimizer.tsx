import { useMemo, useState, useCallback, useEffect } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import {
  getChannelSummaries,
  getChannelSaturationModels,
  getSeasonalityMetrics,
  getDayOfWeekMetrics,
  generateChannelInsights,
  getTimeFrameMonths,
  buildMonthRange,
  buildMonthlyPlanFromData,
  getChannelCapsFromData,
  getOptimalSharesForPeriod,
} from '@/lib/calculations';
import {
  Sliders,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Download,
  Scissors,
  Pause,
  Clock,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Zap,
  BarChart3,
  Calendar,
  Sun,
  Info,
  CheckCircle,
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

type PlanningPeriod = '1m' | '1q' | '6m' | '1y' | 'custom';
type PlanningMode = 'conservative' | 'target' | 'aggressive';
type EvidenceTab = 'optimizer' | 'why' | 'diminishing' | 'bestdays' | 'seasonal';

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
  const { data, aggregate, globalAggregate, isLoading } = useMarketingData({ includeGlobalAggregate: true });
  const timelineStartYear = 2023;
  const timelineEndYear = 2027;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const timelineMonths = useMemo(
    () =>
      Array.from({ length: (timelineEndYear - timelineStartYear + 1) * 12 }, (_, idx) => {
        const year = timelineStartYear + Math.floor(idx / 12);
        const month = idx % 12;
        return { key: `${year}-${String(month + 1).padStart(2, '0')}`, year, month };
      }),
    [timelineStartYear, timelineEndYear]
  );
  const defaultStartKey = '2025-01';
  const defaultEndKey = '2025-12';
  const [budget, setBudget] = useState(5000000);
  const [hasSetInitialBudget, setHasSetInitialBudget] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const [selectedChannel, setSelectedChannel] = useState<string>(CHANNELS[0]);
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>('optimizer');
  const [planningPeriod, setPlanningPeriod] = useState<PlanningPeriod>('1y');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('target');
  const [customStartMonth, setCustomStartMonth] = useState(defaultStartKey);
  const [customEndMonth, setCustomEndMonth] = useState(defaultEndKey);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showAllRationale, setShowAllRationale] = useState(false);
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0;

  // ── Data derivations ──────────────────────────────────────────────────────
  const summaries = useMemo(() => (aggregate || data) ? getChannelSummaries(aggregate || data!) : [], [data, aggregate]);
  const models = useMemo(() => (globalAggregate || data) ? getChannelSaturationModels(globalAggregate || data!) : [], [data, globalAggregate]);
  const summaryByChannel = useMemo(() => {
    const map: Record<string, (typeof summaries)[number] | undefined> = {};
    summaries.forEach((summary) => {
      map[summary.channel] = summary;
    });
    return map;
  }, [summaries]);
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

  const currentFractions = useMemo(() => {
    const totalSpend = summaries.reduce((sum, channel) => sum + channel.totalSpend, 0);
    const fractions: Record<string, number> = {};
    CHANNELS.forEach((channel) => {
      const summary = summaryByChannel[channel];
      fractions[channel] = totalSpend > 0 ? (summary?.totalSpend || 0) / totalSpend : 0.1;
    });
    return fractions;
  }, [summaries, summaryByChannel]);

  const selectedRange = useMemo(() => {
    return buildMonthRange(timelineMonths, defaultStartKey, planningPeriod, customStartMonth, customEndMonth);
  }, [customEndMonth, customStartMonth, defaultStartKey, planningPeriod, timelineMonths]);

  const durationMonthCount = selectedRange.length || 1;
  const totalPlannedBudget = safeBudget * durationMonthCount;
  const modeMultiplier = planningMode === 'conservative' ? 0.8 : planningMode === 'aggressive' ? 1.2 : 1.0;
  const channelCaps = useMemo(() => getChannelCapsFromData(globalAggregate || data || []), [globalAggregate, data]);
  const channelCapByName = useMemo(() => {
    const map: Record<string, (typeof channelCaps)[number] | undefined> = {};
    channelCaps.forEach((entry) => {
      map[entry.channel] = entry;
    });
    return map;
  }, [channelCaps]);

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

  // Optimal allocation shares from non-linear optimizer (with seasonal weights + caps)
  const optimalFractions = useMemo(() => getOptimalSharesForPeriod({
    data: globalAggregate || data || [],
    selectedMonths: selectedRange,
    monthlyBudget: safeBudget,
  }), [globalAggregate, data, selectedRange, safeBudget]);

  // ── THREE FORECAST STATES (all use log model via saturation models) ──────

  // 1. Current Allocation = revenue expected from HISTORICAL spend proportions
  //    This is the user's present mix before any optimization.
  const currentPlan = useMemo(() => buildMonthlyPlanFromData({
    data: globalAggregate || data || [],
    selectedMonths: selectedRange,
    monthlyBudget: safeBudget,
    modeMultiplier,
    allocationShares: currentFractions,
    saturationModels: models,
  }), [globalAggregate, data, selectedRange, safeBudget, modeMultiplier, currentFractions, models]);

  // 2. Optimized Allocation = revenue expected from AI-recommended allocation
  //    Uses non-linear optimizer with seasonal adjustments and channel caps.
  const recommendedPlan = useMemo(() => buildMonthlyPlanFromData({
    data: globalAggregate || data || [],
    selectedMonths: selectedRange,
    monthlyBudget: safeBudget,
    modeMultiplier,
    allocationShares: optimalFractions,
    saturationModels: models,
  }), [globalAggregate, data, selectedRange, safeBudget, modeMultiplier, optimalFractions, models]);

  // 3. Projected Allocation = revenue expected from MANUAL slider allocation
  //    Updates every time the user changes sliders. Starts at historical mix.
  const projectedPlan = useMemo(() => buildMonthlyPlanFromData({
    data: globalAggregate || data || [],
    selectedMonths: selectedRange,
    monthlyBudget: safeBudget,
    modeMultiplier,
    allocationShares: effectiveAlloc,
    saturationModels: models,
  }), [globalAggregate, data, selectedRange, safeBudget, modeMultiplier, effectiveAlloc, models]);

  const scenarioResults = useMemo(() => {
    return BUDGET_SCENARIOS.map((scenario) => {
      const monthlyScenarioBudget = scenario.value;
      const optShares = getOptimalSharesForPeriod({
        data: globalAggregate || data || [],
        selectedMonths: selectedRange,
        monthlyBudget: monthlyScenarioBudget,
      });
      const plan = buildMonthlyPlanFromData({
        data: globalAggregate || data || [],
        selectedMonths: selectedRange,
        monthlyBudget: monthlyScenarioBudget,
        modeMultiplier,
        allocationShares: optShares,
        saturationModels: models,
      });
      return {
        budget: monthlyScenarioBudget * durationMonthCount,
        revenue: plan.totalRevenue,
        roas: plan.totalSpend > 0 ? plan.totalRevenue / plan.totalSpend : 0,
        fractions: plan.channelShares,
      };
    });
  }, [globalAggregate, data, selectedRange, modeMultiplier, durationMonthCount, models]);

  // ── KPI DERIVATIONS ────────────────────────────────────────────────────────
  // 1. Current Allocation Revenue = expected revenue from user's manual/slider mix
  const currentAllocationRevenue = projectedPlan.totalRevenue;
  const currentAllocationROAS = totalPlannedBudget > 0 ? currentAllocationRevenue / totalPlannedBudget : 0;

  // 2. Optimized Revenue = expected revenue from AI-recommended mix
  const optimizedRevenue = recommendedPlan.totalRevenue;
  const optimizedROAS = totalPlannedBudget > 0 ? optimizedRevenue / totalPlannedBudget : 0;

  // 3. Revenue Opportunity & Uplift = gap between optimized and current
  const revenueOpportunity = optimizedRevenue - currentAllocationRevenue;
  const upliftPct = currentAllocationRevenue > 0 ? (revenueOpportunity / currentAllocationRevenue) * 100 : 0;

  const durationLabel = useMemo(() => {
    if (planningPeriod === '1m') return 'this month';
    if (planningPeriod === '1q') return 'this quarter';
    if (planningPeriod === '6m') return 'this half-year';
    if (planningPeriod === '1y') return 'this year';
    return selectedRange.length > 1 ? 'this selected period' : 'this month';
  }, [planningPeriod, selectedRange.length]);
  const scenarioBudgetLabel = useMemo(() => {
    if (planningPeriod === '1m') return 'Monthly Budget';
    if (planningPeriod === '1q') return 'Quarterly Budget';
    if (planningPeriod === '6m') return 'Half-Year Budget';
    if (planningPeriod === '1y') return 'Annual Budget';
    return 'Period Budget';
  }, [planningPeriod]);
  const totalPct = useMemo(() => CHANNELS.reduce((s, ch) => s + (alloc[ch] || 0), 0), [alloc]);

  // ── Insight generation ────────────────────────────────────────────────────
  const insights = useMemo(() =>
    summaries.length > 0 && models.length > 0
      ? generateChannelInsights(summaries, models, seasonality, dowMetrics, safeBudget, optimalFractions, effectiveAlloc)
      : [],
  [summaries, models, seasonality, dowMetrics, safeBudget, optimalFractions, effectiveAlloc]);

  // ── Per-channel reasoning (data-driven, for "Why this allocation" panel) ──
  const channelReasons = useMemo(() => {
    if (summaries.length === 0 || models.length === 0) return {};
    const avgROAS = summaries.reduce((s, c) => s + c.roas, 0) / (summaries.length || 1);
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const reasons: Record<string, string> = {};
    for (const ch of CHANNELS) {
      const summary = summaries.find(s => s.channel === ch);
      const model = models.find(m => m.channel === ch);
      const sea = seasonality.find(s => s.channel === ch);
      const dow = dowMetrics.find(d => d.channel === ch);
      const cap = channelCapByName[ch];
      if (!summary || !model) { reasons[ch] = `${ch} — insufficient data.`; continue; }
      const optPct = (optimalFractions[ch] || 0) * 100;
      const curPct = (currentFractions[ch] || 0) * 100;
      const optSpend = (optimalFractions[ch] || 0) * safeBudget;
      const isHighROAS = summary.roas > avgROAS * 1.2;
      const isLowROAS = summary.roas < avgROAS * 0.8;
      const peakMonthName = sea ? MONTH_NAMES[sea.peakMonth] : '';
      const bestDayName = dow ? DOW_NAMES[dow.bestDay] : '';
      const hasCap = cap && Number.isFinite(cap.capSpend);
      const isNearCap = hasCap && optSpend >= cap!.capSpend * 0.85;
      const isIncreased = optPct > curPct + 3;
      const isReduced = optPct < curPct - 3;
      let reason = '';
      if (isHighROAS && isIncreased) {
        reason = `Strongest historical efficiency at ${summary.roas.toFixed(1)}x ROAS (${Math.round((summary.roas/avgROAS-1)*100)}% above average). Increased because returns remain strong with additional spend.`;
      } else if (isHighROAS && !isIncreased) {
        reason = `High efficiency at ${summary.roas.toFixed(1)}x ROAS. Allocation held steady — already near optimal share for this channel.`;
      } else if (isLowROAS && isReduced) {
        reason = `Below-average ROAS of ${summary.roas.toFixed(1)}x (portfolio avg ${avgROAS.toFixed(1)}x). Reduced to redirect budget toward higher-performing channels.`;
      } else if (isLowROAS) {
        reason = `ROAS of ${summary.roas.toFixed(1)}x sits below portfolio average. Budget held modest to avoid diluting overall return.`;
      } else if (isNearCap && hasCap) {
        reason = `Allocation limited near ${formatINRCompact(cap!.capSpend)}/mo — returns flatten at higher spend. Budget redistributed to channels with more headroom.`;
      } else if (sea && sea.peakBoost > 0.12) {
        reason = `${summary.roas.toFixed(1)}x ROAS with strong seasonality — peaks in ${peakMonthName} (+${Math.round(sea.peakBoost*100)}% uplift). Budget weighted toward peak months.`;
      } else if (dow && dow.weekendBias !== 'neutral') {
        reason = `${summary.roas.toFixed(1)}x ROAS, in line with average. Strongest on ${bestDayName}s — bid concentration improves efficiency.`;
      } else {
        reason = `${summary.roas.toFixed(1)}x ROAS (near portfolio average of ${avgROAS.toFixed(1)}x). Allocation reflects proportional historical return.`;
      }
      reasons[ch] = reason;
    }
    return reasons;
  }, [summaries, models, seasonality, dowMetrics, optimalFractions, currentFractions, safeBudget, channelCapByName]);

  // ── Determine channel action for rationale section ─────────────────────────
  const channelActions = useMemo(() => {
    const actions: Record<string, { action: 'increase' | 'reduce' | 'hold'; importance: number }> = {};
    const avgROAS = summaries.reduce((s, c) => s + c.roas, 0) / (summaries.length || 1);
    for (const ch of CHANNELS) {
      const optPct = (optimalFractions[ch] || 0) * 100;
      const currentPct = (currentFractions[ch] || 0) * 100;
      const delta = optPct - currentPct;
      const summary = summaries.find(s => s.channel === ch);
      const importance = Math.abs(delta) * (summary?.roas || 1);
      if (delta > 2) actions[ch] = { action: 'increase', importance };
      else if (delta < -2) actions[ch] = { action: 'reduce', importance };
      else actions[ch] = { action: 'hold', importance: 0 };
    }
    return actions;
  }, [optimalFractions, currentFractions, summaries]);

  // Top 5 recommendations sorted by importance
  const topRecommendations = useMemo(() => {
    return CHANNELS
      .filter(ch => channelActions[ch]?.action !== 'hold')
      .sort((a, b) => (channelActions[b]?.importance || 0) - (channelActions[a]?.importance || 0))
      .slice(0, 5);
  }, [channelActions]);

  const remainingRecommendations = useMemo(() => {
    return CHANNELS
      .filter(ch => !topRecommendations.includes(ch))
      .sort((a, b) => (channelActions[b]?.importance || 0) - (channelActions[a]?.importance || 0));
  }, [channelActions, topRecommendations]);

  // ── Seasonal peaks and Best-day tables for evidence tabs ──────────────────
  const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const seasonalityTableData = useMemo(() => {
    return CHANNELS.map(ch => {
      const sea = seasonality.find(s => s.channel === ch);
      if (!sea) return { channel: ch, peakMonth: '—', implication: 'No seasonal pattern detected' };
      const uplift = Math.round(sea.peakBoost * 100);
      const quarter = sea.peakMonth < 3 ? 'Q1' : sea.peakMonth < 6 ? 'Q2' : sea.peakMonth < 9 ? 'Q3' : 'Q4';
      return {
        channel: ch,
        peakMonth: MONTH_NAMES_SHORT[sea.peakMonth],
        implication: uplift > 15
          ? `Higher efficiency in ${quarter} (+${uplift}%)`
          : uplift > 5
            ? `Moderate ${quarter} bump (+${uplift}%)`
            : 'Relatively flat across seasons',
      };
    });
  }, [seasonality]);

  const dowTableData = useMemo(() => {
    return CHANNELS.map(ch => {
      const d = dowMetrics.find(m => m.channel === ch);
      if (!d) return { channel: ch, best1: '—', best2: '—' };
      const ranked = d.dowIndex
        .map((v, i) => ({ v, i }))
        .sort((a, b) => b.v - a.v);
      return {
        channel: ch,
        best1: DOW_NAMES_SHORT[ranked[0].i],
        best2: DOW_NAMES_SHORT[ranked[1].i],
      };
    });
  }, [dowMetrics]);

  // ── Marginal ROAS curve for selected channel ──────────────────────────────
  const marginalCurveData = useMemo(() => {
    const cap = channelCapByName[selectedChannel];
    if (!cap) return [];
    return [
      { spend: cap.bucketSpend.low, roas: cap.bucketROAS.low, bucket: 'Low Spend' },
      { spend: cap.bucketSpend.medium, roas: cap.bucketROAS.medium, bucket: 'Mid Spend' },
      { spend: cap.bucketSpend.high, roas: cap.bucketROAS.high, bucket: 'High Spend' },
    ].filter((p) => p.spend > 0 && p.roas > 0);
  }, [selectedChannel, channelCapByName]);

  const currentChannelSpend = (projectedPlan.channelTotals[selectedChannel]?.spend || 0) / durationMonthCount;

  // ── Comparison bar chart data ─────────────────────────────────────────────
  const comparisonData = useMemo(() =>
    CHANNELS.map(ch => ({
      channel: ch.replace(' ', '\n'),
      current: parseFloat((((projectedPlan.channelShares[ch] || 0) * 100)).toFixed(1)),
      optimal: parseFloat(((optimalFractions[ch] || 0) * 100).toFixed(1)),
    })),
  [projectedPlan.channelShares, optimalFractions]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSlider = useCallback((ch: string, val: number[]) => {
    setAllocations(prev => ({ ...prev, [ch]: val[0] / 100 }));
  }, []);

  const resetToCurrent = () => {
    setAllocations({ ...currentFractions });
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

  const toggleRowExpand = (ch: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  // ── Efficiency badge logic ────────────────────────────────────────────────
  const getEfficiencyBadge = (ch: string) => {
    const summary = summaryByChannel[ch];
    const cap = channelCapByName[ch];
    if (!summary) return { label: '—', color: 'var(--text-muted)', bg: 'transparent' };

    const optPct = (optimalFractions[ch] || 0) * 100;
    const curPct = (currentFractions[ch] || 0) * 100;
    const optSpend = (optimalFractions[ch] || 0) * safeBudget;
    const hasCap = cap && Number.isFinite(cap.capSpend);
    const isNearCap = hasCap && optSpend >= cap!.capSpend * 0.85;
    const avgROAS = summaries.reduce((s, c) => s + c.roas, 0) / (summaries.length || 1);

    // Saturated: channel has a real diminishing-return cap and optimizer is pushing against it
    if (isNearCap && summary.roas < avgROAS * 0.9) {
      return { label: 'Saturated', color: '#F87171', bg: 'rgba(248,113,113,0.1)' };
    }
    // Under-scaled: optimizer wants to give this channel significantly more than historical
    if (optPct > curPct + 4 && summary.roas > avgROAS * 0.9) {
      return { label: 'Under-scaled', color: '#34D399', bg: 'rgba(52,211,153,0.1)' };
    }
    // Reduced: optimizer is pulling budget away from this channel
    if (optPct < curPct - 4) {
      return { label: 'Over-scaled', color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' };
    }
    return { label: 'Efficient', color: '#60A5FA', bg: 'rgba(96,165,250,0.1)' };
  };

  if (isLoading) return <DashboardSkeleton />;

  // ── Shared styles ─────────────────────────────────────────────────────────
  const evidenceTabStyle = (active: boolean) => ({
    fontFamily: 'Outfit' as const, fontSize: 12, fontWeight: 600 as const,
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer' as const, transition: '150ms',
    backgroundColor: active ? '#E8803A' : 'var(--border-subtle)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: 'none',
    display: 'flex' as const, alignItems: 'center' as const, gap: 6,
  });

  const actionBadgeStyle = (action: 'increase' | 'reduce' | 'hold') => ({
    fontFamily: 'Outfit' as const, fontSize: 10, fontWeight: 700 as const,
    padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    color: action === 'increase' ? '#34D399' : action === 'reduce' ? '#F87171' : 'var(--text-muted)',
    backgroundColor: action === 'increase' ? 'rgba(52,211,153,0.1)' : action === 'reduce' ? 'rgba(248,113,113,0.1)' : 'var(--border-subtle)',
  });

  return (
    <div className="mobile-page mix-page space-y-6" style={{ maxWidth: 1320 }}>
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — HEADER & CONTROLS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mobile-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            Marketing Mix Optimizer
          </h1>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 12 }}>AI-powered budget allocation & revenue forecasting</p>
        </div>
        <button 
          onClick={() => exportToCSV(CHANNELS.map(ch => {
            const currentAllocation = projectedPlan.channelShares[ch] || 0;
            const optimalAllocation = optimalFractions[ch] || 0;
            const currentRev = projectedPlan.channelTotals[ch]?.revenue || 0;
            const optRev = recommendedPlan.channelTotals[ch]?.revenue || 0;
            return {
            Channel: ch,
            'Current Allocation (%)': (currentAllocation * 100).toFixed(1),
            'AI Optimal Allocation (%)': (optimalAllocation * 100).toFixed(1),
            'Current Spend': ((projectedPlan.channelTotals[ch]?.spend || 0)).toFixed(0),
            'Optimal Spend': ((recommendedPlan.channelTotals[ch]?.spend || 0)).toFixed(0),
            'Current Revenue': currentRev.toFixed(0),
            'Optimal Revenue': optRev.toFixed(0)
            };
          }), 'Luma_Marketing_Mix_Optimization')}
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
          Export
        </button>
      </div>

      {/* Control Bar */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Monthly Budget
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>₹</span>
              <input
                type="number"
                value={safeBudget}
                min={0}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  setBudget(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                }}
                style={{ flex: 1, minWidth: 110, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Outfit', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
              />
            </div>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {formatINRCompact(safeBudget)} / month · {formatINRCompact(totalPlannedBudget)} total
            </p>
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Planning Period
            </p>
            <select
              value={planningPeriod}
              onChange={(e) => setPlanningPeriod(e.target.value as PlanningPeriod)}
              style={{ width: '100%', backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 10, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 13, padding: '11px 12px' }}
            >
              <option value="1m">1 Month</option>
              <option value="1q">1 Quarter</option>
              <option value="6m">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="custom">Custom</option>
            </select>
            {planningPeriod === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <select
                  value={customStartMonth}
                  onChange={(e) => setCustomStartMonth(e.target.value)}
                  style={{ flex: 1, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 11, padding: '7px 8px' }}
                >
                  {timelineMonths.map((m) => (
                    <option key={`start-${m.key}`} value={m.key}>{`${monthNames[m.month]} ${m.year}`}</option>
                  ))}
                </select>
                <span style={{ fontFamily: 'Outfit', fontSize: 10, color: 'var(--text-muted)' }}>to</span>
                <select
                  value={customEndMonth}
                  onChange={(e) => setCustomEndMonth(e.target.value)}
                  style={{ flex: 1, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 11, padding: '7px 8px' }}
                >
                  {timelineMonths.map((m) => (
                    <option key={`end-${m.key}`} value={m.key}>{`${monthNames[m.month]} ${m.year}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Planning Mode
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { value: 'conservative', label: 'Conservative (0.8x)' },
                { value: 'target', label: 'Target (1.0x)' },
                { value: 'aggressive', label: 'Aggressive (1.2x)' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setPlanningMode(mode.value as PlanningMode)}
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: planningMode === mode.value ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                    backgroundColor: planningMode === mode.value ? 'var(--bg-root)' : 'transparent',
                    color: planningMode === mode.value ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: '150ms'
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Helper line */}
        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', opacity: 0.7, marginTop: 2 }}>
          Recommendations use historical efficiency, diminishing returns, weekday trends, and seasonality.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — OUTCOME CARDS (5 KPIs)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mix-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {[
          {
            label: 'Current Revenue',
            value: formatINRCompact(currentAllocationRevenue),
            accent: '#60A5FA',
          },
          {
            label: 'Optimized Revenue',
            value: formatINRCompact(optimizedRevenue),
            accent: '#34D399',
          },
          {
            label: 'Revenue Uplift',
            value: `${revenueOpportunity >= 0 ? '+' : ''}${formatINRCompact(revenueOpportunity)}`,
            sub: upliftPct > 0 ? `+${upliftPct.toFixed(1)}%` : `${upliftPct.toFixed(1)}%`,
            accent: revenueOpportunity > 0 ? '#34D399' : '#F87171',
          },
          {
            label: 'Blended ROAS',
            value: `${optimizedROAS.toFixed(2)}x`,
            accent: '#E8803A',
          },
          {
            label: 'Active Channels',
            value: `${activeChannels.length} / 10`,
            accent: '#A78BFA',
          },
        ].map((kpi, idx) => (
          <div
            key={kpi.label}
            className="card-enter"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 14,
              padding: '18px 20px',
              animationDelay: `${idx * 60}ms`,
            }}
          >
            <p style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{kpi.label}</p>
            <p style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginTop: 6 }}>
              {kpi.value}
            </p>
            {kpi.sub && (
              <p style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: kpi.accent, marginTop: 2 }}>{kpi.sub}</p>
            )}
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: kpi.sub ? 8 : 12, opacity: 0.4 }} />
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — OPPORTUNITY BANNER
          ═══════════════════════════════════════════════════════════════════════ */}
      {revenueOpportunity > 5000 ? (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid #34D399',
          borderRadius: 12,
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundImage: 'linear-gradient(to right, rgba(52, 211, 153, 0.05), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(52, 211, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={24} color="#34D399" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                {formatINRCompact(revenueOpportunity)} opportunity identified
              </h2>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.5, maxWidth: 600 }}>
                The AI recommendation increases blended ROAS from {currentAllocationROAS.toFixed(2)}x to {optimizedROAS.toFixed(2)}x (+{upliftPct.toFixed(1)}% uplift). This accounts for diminishing returns, channel saturation, and seasonality over {durationLabel}.
              </p>
            </div>
          </div>
          <button
            onClick={applyOptimal}
            style={{
              padding: '12px 24px',
              backgroundColor: '#34D399',
              color: '#000',
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'transform 150ms',
            }}
          >
            Apply Allocation <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
           <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={24} color="var(--text-secondary)" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                Allocation is near optimal
              </h2>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.5, maxWidth: 600 }}>
                Your current mix matches or closely approximates the AI recommendation. Blended ROAS is stable at {currentAllocationROAS.toFixed(2)}x. Minimal efficiency gains (+{upliftPct.toFixed(1)}%) are available.
              </p>
            </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — ALLOCATION COMPARISON TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Channel Allocation
              </h2>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Current vs. recommended budget split across {activeChannels.length} active channels
              </p>
            </div>
            <button onClick={applyOptimal} style={{
              fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: 'var(--bg-root)', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(232,128,58,0.25)', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkles size={12} /> Apply AI Mix
            </button>
          </div>
          <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.8fr 1fr 1fr 0.7fr 0.8fr 28px',
          padding: '10px 24px',
          gap: 8,
          backgroundColor: 'var(--bg-root)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {['Channel', 'Current', 'Recommended', 'Change', 'Status', ''].map(h => (
            <span key={h} style={{
              fontFamily: 'Outfit', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>{h}</span>
          ))}
        </div>

        {/* Channel rows */}
        {CHANNELS.map((ch, ci) => {
          const currentPct = Math.round((currentFractions[ch] || 0) * 100);
          const optPct = Math.round((optimalFractions[ch] || 0) * 100);
          const delta = optPct - currentPct;
          const badge = getEfficiencyBadge(ch);
          const color = CHANNEL_COLORS[ci];
          const isExpanded = expandedRows.has(ch);
          const cap = channelCapByName[ch];
          const summary = summaryByChannel[ch];
          const sea = seasonality.find(s => s.channel === ch);
          const dow = dowMetrics.find(d => d.channel === ch);
          const reason = channelReasons[ch];

          return (
            <div key={ch} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {/* Main row */}
              <div
                onClick={() => toggleRowExpand(ch)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 1fr 1fr 0.7fr 0.8fr 28px',
                  padding: '14px 24px',
                  gap: 8,
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 120ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {/* Channel name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                </div>

                {/* Current allocation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, backgroundColor: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', maxWidth: 60 }}>
                    <div style={{ width: `${Math.min(100, currentPct * 2.5)}%`, height: '100%', backgroundColor: 'rgba(96,165,250,0.5)', borderRadius: 2, transition: 'width 300ms' }} />
                  </div>
                  <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 32 }}>{currentPct}%</span>
                </div>

                {/* Recommended allocation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, backgroundColor: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', maxWidth: 60 }}>
                    <div style={{ width: `${Math.min(100, optPct * 2.5)}%`, height: '100%', backgroundColor: '#E8803A', borderRadius: 2, transition: 'width 300ms' }} />
                  </div>
                  <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 32 }}>{optPct}%</span>
                </div>

                {/* Change */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {delta > 0 ? <ArrowUpRight size={13} style={{ color: '#34D399' }} /> :
                   delta < 0 ? <ArrowDownRight size={13} style={{ color: '#F87171' }} /> :
                   <Minus size={13} style={{ color: 'var(--text-muted)' }} />}
                  <span style={{
                    fontFamily: 'Outfit', fontSize: 12, fontWeight: 600,
                    color: delta > 0 ? '#34D399' : delta < 0 ? '#F87171' : 'var(--text-muted)',
                  }}>
                    {delta > 0 ? '+' : ''}{delta}%
                  </span>
                </div>

                {/* Efficiency badge */}
                <span style={{
                  fontFamily: 'Outfit', fontSize: 10, fontWeight: 700,
                  color: badge.color, backgroundColor: badge.bg,
                  padding: '3px 8px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {badge.label}
                </span>

                {/* Expand chevron */}
                {isExpanded
                  ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                  : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{
                  padding: '0 24px 16px 50px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 12,
                  animation: 'card-enter 200ms ease both',
                }}>
                  <div style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Historical ROAS</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color, marginTop: 3 }}>{summary ? `${summary.roas.toFixed(2)}x` : '—'}</p>
                  </div>
                  <div style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Diminishing Cap</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color, marginTop: 3 }}>
                      {cap && Number.isFinite(cap.capSpend) ? formatINRCompact(cap.capSpend) : 'No cap'}
                    </p>
                  </div>
                  <div style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Best Day</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color, marginTop: 3 }}>
                      {dow ? DOW_NAMES_SHORT[dow.bestDay] : '—'}
                    </p>
                  </div>
                  <div style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Peak Season</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color, marginTop: 3 }}>
                      {sea ? MONTH_NAMES_SHORT[sea.peakMonth] : '—'}
                    </p>
                  </div>
                  {reason && (
                    <div style={{
                      gridColumn: '1 / -1',
                      backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 14px',
                      border: '1px solid var(--border-subtle)',
                    }}>
                      <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Rationale: </strong>
                        {reason}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — WHY THIS ALLOCATION
          ═══════════════════════════════════════════════════════════════════════ */}
      {Object.keys(channelReasons).length > 0 && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Lightbulb size={16} style={{ color: '#FBBF24', flexShrink: 0 }} />
            <h2 style={{ fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Why this allocation
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topRecommendations.map((ch, i) => {
              const act = channelActions[ch];
              const ci = CHANNELS.indexOf(ch);
              const color = CHANNEL_COLORS[ci];
              return (
                <div key={ch} className="card-enter" style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '12px 16px', borderRadius: 10,
                  backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)',
                  animationDelay: `${i * 50}ms`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ch}</span>
                      <span style={actionBadgeStyle(act.action)}>{act.action}</span>
                    </div>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                      {channelReasons[ch]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible "View all" */}
          {remainingRecommendations.length > 0 && (
            <>
              <button
                onClick={() => setShowAllRationale(!showAllRationale)}
                style={{
                  fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600,
                  color: '#E8803A', background: 'none', border: 'none', cursor: 'pointer',
                  marginTop: 14, display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                }}
              >
                {showAllRationale ? 'Hide' : 'View all channel rationale'}
                {showAllRationale ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {showAllRationale && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {remainingRecommendations.map((ch) => {
                    const act = channelActions[ch];
                    const ci = CHANNELS.indexOf(ch);
                    const color = CHANNEL_COLORS[ci];
                    return (
                      <div key={ch} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        padding: '10px 16px', borderRadius: 10,
                        backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)',
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0, marginTop: 6 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{ch}</span>
                            <span style={actionBadgeStyle(act.action)}>{act.action}</span>
                          </div>
                          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                            {channelReasons[ch]}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 6 — EVIDENCE TABS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={evidenceTabStyle(evidenceTab === 'optimizer')} onClick={() => setEvidenceTab('optimizer')}>
          <Sliders size={13} /> Optimizer
        </button>
        <button style={evidenceTabStyle(evidenceTab === 'why')} onClick={() => setEvidenceTab('why')}>
          <Info size={13} /> Why It Works
        </button>
        <button style={evidenceTabStyle(evidenceTab === 'diminishing')} onClick={() => setEvidenceTab('diminishing')}>
          <TrendingDown size={13} /> Diminishing Returns
        </button>
        <button style={evidenceTabStyle(evidenceTab === 'bestdays')} onClick={() => setEvidenceTab('bestdays')}>
          <Sun size={13} /> Best Days
        </button>
        <button style={evidenceTabStyle(evidenceTab === 'seasonal')} onClick={() => setEvidenceTab('seasonal')}>
          <Calendar size={13} /> Seasonal Peaks
        </button>
      </div>

      {/* ── OPTIMIZER TAB ── */}
      {evidenceTab === 'optimizer' && (
        <div className="mix-optimizer-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Manual Allocation Sliders */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Manual Allocation</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={resetToCurrent} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 8, backgroundColor: 'var(--bg-root)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)', cursor: 'pointer' }}>Reset to Current</button>
                <button onClick={applyOptimal} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: 'var(--bg-root)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(232,128,58,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  AI Recommendation <Sparkles size={12} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CHANNELS.map((ch, ci) => {
                const pct = Math.round((alloc[ch] || 0) * 100);
                const monthlyAmt = (effectiveAlloc[ch] || 0) * safeBudget;
                const periodAmt = monthlyAmt * durationMonthCount;
                const projRev = projectedPlan.channelTotals[ch]?.revenue || 0;
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
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)' }}>{formatINRCompact(periodAmt)} spend</span>
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color }}>
                        → {formatINRCompact(projRev)} rev ({periodAmt > 0 ? (projRev / periodAmt).toFixed(2) : '0.00'}x)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, marginTop: 12, backgroundColor: Math.abs(totalPct - 1) > 0.01 ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)', color: Math.abs(totalPct - 1) > 0.01 ? '#F87171' : '#34D399', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600 }}>
              Total: {Math.round(totalPct * 100)}%
            </div>
          </div>

          {/* Right panel — Charts & Scenarios */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Current vs Optimal Chart */}
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

            {/* Budget Scenarios */}
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 0' }}>
                <h2 style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Budget Scenarios</h2>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '16px 0' }} />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-card)' }}>
                    {[scenarioBudgetLabel, 'Proj. Revenue', 'ROAS', `vs ${formatINRCompact(BUDGET_SCENARIOS[1].value * durationMonthCount)}`].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'Outfit', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BUDGET_SCENARIOS.map((s, i) => {
                    const sr = scenarioResults[i] || { revenue: 0, roas: 0 };
                    const baseline = scenarioResults[1]?.revenue || 0;
                    const diff = sr.revenue - baseline;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                        <td style={{ padding: '12px 16px', fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-secondary)' }}>{formatINRCompact(s.value * durationMonthCount)}</td>
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
          </div>
        </div>
      )}

      {/* ── WHY IT WORKS TAB ── */}
      {evidenceTab === 'why' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>How the optimizer works</h2>
          <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            Four steps from raw data to allocation recommendation
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              {
                step: '01',
                title: 'Analyze historical efficiency',
                desc: 'Calculate ROAS for each channel across 3 years of daily data to establish baseline performance.',
                icon: BarChart3,
                color: '#60A5FA',
              },
              {
                step: '02',
                title: 'Detect saturation & diminishing returns',
                desc: 'Group spend into low/mid/high buckets. Identify channels where higher spend yields lower returns.',
                icon: TrendingDown,
                color: '#F87171',
              },
              {
                step: '03',
                title: 'Adjust for day & season patterns',
                desc: 'Weight allocations for monthly seasonality and day-of-week performance differences.',
                icon: Calendar,
                color: '#FBBF24',
              },
              {
                step: '04',
                title: 'Reallocate toward highest marginal return',
                desc: 'Use constrained optimization to maximize total revenue while respecting saturation caps.',
                icon: Zap,
                color: '#34D399',
              },
            ].map((item, i) => (
              <div key={i} className="card-enter" style={{
                backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)',
                borderRadius: 12, padding: '20px 18px',
                animationDelay: `${i * 80}ms`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <item.icon size={16} style={{ color: item.color }} />
                  </div>
                  <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: item.color }}>{item.step}</span>
                </div>
                <h3 style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {item.title}
                </h3>
                <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Methodology note */}
          <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Note: </strong>
              These allocations are predictive estimates designed for planning, based on a log-curve diminishing returns model (revenue = α · ln(spend + 1)) fitted on monthly aggregated data. They are not guaranteed outcomes.
            </p>
          </div>
        </div>
      )}

      {/* ── DIMINISHING RETURNS TAB ── */}
      {evidenceTab === 'diminishing' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Diminishing Returns</h2>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                More spend does not always mean better return. Select a channel to see its curve.
              </p>
            </div>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 10,
                color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans', fontSize: 13, padding: '10px 14px',
                minWidth: 180, cursor: 'pointer',
              }}
            >
              {CHANNELS.map(ch => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          </div>

          {(() => {
            const cap = channelCapByName[selectedChannel];
            const color = CHANNEL_COLORS[CHANNELS.indexOf(selectedChannel)];
            const summary = summaryByChannel[selectedChannel];
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Historical ROAS', value: summary ? `${summary.roas.toFixed(2)}x` : '—' },
                    { label: 'Saturation Cap', value: cap && Number.isFinite(cap.capSpend) ? formatINRCompact(cap.capSpend) : 'No cap' },
                    { label: 'Current Spend', value: formatINRCompact(currentChannelSpend) },
                    { label: 'High-Bucket ROAS', value: cap ? `${cap.bucketROAS.high.toFixed(2)}x` : '—' },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                      <p style={{ fontFamily: 'Outfit', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{kpi.label}</p>
                      <p style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color, marginTop: 3 }}>{kpi.value}</p>
                    </div>
                  ))}
                </div>

                <ResponsiveContainer width="100%" height={300}>
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
                    <ReferenceLine y={cap?.blendedROAS || 0} stroke="#F87171" strokeDasharray="4 4" label={{ value: 'Blended Avg', position: 'insideRight', style: { fill: '#F87171', fontSize: 10 } }} />
                    <ReferenceLine x={currentChannelSpend} stroke="#FBBF24" strokeDasharray="4 4" label={{ value: 'Current', position: 'top', style: { fill: '#FBBF24', fontSize: 10 } }} />
                    <Line type="monotone" dataKey="roas" stroke={color} strokeWidth={2.5} dot={{ r: 4 }} name="Observed ROAS" />
                  </LineChart>
                </ResponsiveContainer>

                <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: 'var(--bg-root)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                    Points show ROAS at low, medium, and high spend levels. When higher spend drops below the red dashed line (blended average), the channel is capped.
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── BEST DAYS TAB ── */}
      {evidenceTab === 'bestdays' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 0' }}>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Best Days by Channel</h2>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              Top performing days to concentrate bids. Based on historical day-of-week ROAS.
            </p>
            <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Channel', 'Best Day', 'Runner-up'].map(h => (
                  <th key={h} style={{
                    padding: '12px 24px', textAlign: h === 'Channel' ? 'left' : 'center',
                    fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dowTableData.map((row, i) => (
                <tr key={row.channel} style={{ borderTop: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td style={{ padding: '12px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: CHANNEL_COLORS[i], flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{row.channel}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 24px', textAlign: 'center', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#34D399' }}>{row.best1}</td>
                  <td style={{ padding: '12px 24px', textAlign: 'center', fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{row.best2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SEASONAL PEAKS TAB ── */}
      {evidenceTab === 'seasonal' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 0' }}>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Seasonal Peaks by Channel</h2>
            <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              Which months each channel historically outperforms. Budget is weighted toward peak periods automatically.
            </p>
            <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Channel', 'Peak Month', 'Implication'].map(h => (
                  <th key={h} style={{
                    padding: '12px 24px', textAlign: h === 'Channel' ? 'left' : h === 'Implication' ? 'left' : 'center',
                    fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasonalityTableData.map((row, i) => (
                <tr key={row.channel} style={{ borderTop: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td style={{ padding: '12px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: CHANNEL_COLORS[i], flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{row.channel}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 24px', textAlign: 'center', fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: '#34D399' }}>{row.peakMonth}</td>
                  <td style={{ padding: '12px 24px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{row.implication}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

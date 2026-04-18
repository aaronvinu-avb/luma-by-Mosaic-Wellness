import { useMemo, useState, useCallback, useEffect } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { ChannelName } from '@/components/ChannelName';
import {
  getChannelSummaries,
  getChannelSaturationModels,
  getSeasonalityMetrics,
  getDayOfWeekMetrics,
  getTimeFrameMonths,
  buildMonthRange,
  buildMonthlyPlanFromData,
  getChannelCapsFromData,
  getOptimalSharesForPeriod,
  computeRevenueUpliftMetrics,
  classifyMixChannelEfficiency,
  getPeriodTimeWeightSums,
  getPortfolioWeightedROAS,
  getPeriodicMarginalROAS,
  type MixChannelEfficiency,
} from '@/lib/calculations';
import {
  Sliders,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Download,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
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
type EvidenceTab = 'why' | 'diminishing' | 'bestdays' | 'seasonal' | 'scenarios';

const BUDGET_SCENARIOS = [
  { label: 'Conservative ₹30L', value: 3000000, color: '#60A5FA' },
  { label: 'Current ₹50L', value: 5000000, color: '#FBBF24' },
  { label: 'Aggressive ₹75L', value: 7500000, color: '#34D399' },
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)',
    borderRadius: 10, padding: '10px 14px', fontFamily: 'Plus Jakarta Sans', fontSize: 12, boxShadow: 'var(--shadow-sm)'
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

export default function MixOptimizer() {
  const { data, aggregate, globalAggregate, isLoading, dataSource, dataUpdatedAt } = useMarketingData({ includeGlobalAggregate: true });
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
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>('why');
  const [planningPeriod, setPlanningPeriod] = useState<PlanningPeriod>('1y');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('target');
  const [customStartMonth, setCustomStartMonth] = useState(defaultStartKey);
  const [customEndMonth, setCustomEndMonth] = useState(defaultEndKey);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedManualRows, setExpandedManualRows] = useState<Set<string>>(new Set());
  const [showWhyAllocation, setShowWhyAllocation] = useState(false);
  const [showComparisonChart, setShowComparisonChart] = useState(false);
  const [showBudgetScenarios, setShowBudgetScenarios] = useState(false);
  const [showAllRationale, setShowAllRationale] = useState(false);
  const [metricDefinitionsOpen, setMetricDefinitionsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'current' | 'ai'>('current');
  const [editMode, setEditMode] = useState(false);
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0;

  const dataDateRange = useMemo(() => {
    if (!data?.length) return null;
    let min = data[0].date;
    let max = data[0].date;
    for (const r of data) {
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
    }
    return { min, max };
  }, [data]);

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

  const portfolioWeightedROAS = useMemo(() => getPortfolioWeightedROAS(summaries), [summaries]);
  const seasonality = useMemo(() => (globalAggregate || data) ? getSeasonalityMetrics(globalAggregate || data!) : [], [data, globalAggregate]);
  const dowMetrics = useMemo(() => (aggregate || data) ? getDayOfWeekMetrics(aggregate || data!) : [], [data, aggregate]);
  const timeFrameMonths = useMemo(() => getTimeFrameMonths(aggregate || data || []), [aggregate, data]);

  const avgMonthlySpend = useMemo(() => {
    if (summaries.length === 0) return 5000000;
    const totalSpend = summaries.reduce((s, ch) => s + ch.totalSpend, 0);
    return Math.round(totalSpend / (timeFrameMonths || 1));
  }, [summaries, timeFrameMonths]);

  useEffect(() => {
    if (hasSetInitialBudget || summaries.length === 0) return;
    const rounded = Math.round(avgMonthlySpend / 1000) * 1000;
    setBudget(Math.max(0, rounded));
    setHasSetInitialBudget(true);
  }, [avgMonthlySpend, hasSetInitialBudget, summaries.length]);

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

  // ── TWO FORECAST STATES (concave spend–response α·ln(spend+1); seasonality × DOW per calendar month)
  //
  // A) Manual / “current allocation”: user sliders → normalized shares → buildMonthlyPlanFromData
  // B) Optimized allocation: KKT on Σ αᵢ·ln(xᵢ+1)·Wᵢ with Wᵢ = Σₘ seasonₘ·dowₘ (same structure as forecast)

  // Optimized Allocation = revenue from AI-recommended shares (solver + bounded simplex projection).
  const recommendedPlan = useMemo(() => buildMonthlyPlanFromData({
    data: globalAggregate || data || [],
    selectedMonths: selectedRange,
    monthlyBudget: safeBudget,
    modeMultiplier,
    allocationShares: optimalFractions,
    saturationModels: models,
  }), [globalAggregate, data, selectedRange, safeBudget, modeMultiplier, optimalFractions, models]);

  // Manual allocation forecast — recomputed whenever sliders / pauses change (normalized inside engine).
  const projectedPlan = useMemo(() => buildMonthlyPlanFromData({
    data: globalAggregate || data || [],
    selectedMonths: selectedRange,
    monthlyBudget: safeBudget,
    modeMultiplier,
    allocationShares: effectiveAlloc,
    saturationModels: models,
  }), [globalAggregate, data, selectedRange, safeBudget, modeMultiplier, effectiveAlloc, models]);

  /** Per-channel Σₘ(season × DOW blend) — aligns marginal story with solver weights. */
  const periodWeightSums = useMemo(() => {
    if (!selectedRange.length || !(globalAggregate || data)) return {} as Record<string, number>;
    return getPeriodTimeWeightSums(globalAggregate || data!, selectedRange);
  }, [globalAggregate, data, selectedRange]);

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

  const scenarioIncrementalNote = useMemo(() => {
    const b0 = BUDGET_SCENARIOS[0]?.value;
    const b1 = BUDGET_SCENARIOS[1]?.value;
    const b2 = BUDGET_SCENARIOS[2]?.value;
    const s0 = scenarioResults[0];
    const s1 = scenarioResults[1];
    const s2 = scenarioResults[2];
    if (
      b0 === undefined || b1 === undefined || b2 === undefined ||
      !s0 || !s1 || !s2 || durationMonthCount < 1
    ) return null;
    const periodBudgetDelta = (hi: number, lo: number) => (hi - lo) * durationMonthCount;
    const dLow = periodBudgetDelta(b1, b0);
    const dHigh = periodBudgetDelta(b2, b1);
    const mLow = dLow > 0 ? (s1.revenue - s0.revenue) / dLow : 0;
    const mHigh = dHigh > 0 ? (s2.revenue - s1.revenue) / dHigh : 0;
    return {
      mLow,
      mHigh,
      deltaRevUpper: s2.revenue - s1.revenue,
      extraBudgetUpper: dHigh,
      labels: {
        low: `${formatINRCompact(b0)}/mo → ${formatINRCompact(b1)}/mo`,
        high: `${formatINRCompact(b1)}/mo → ${formatINRCompact(b2)}/mo`,
      },
    };
  }, [scenarioResults, durationMonthCount]);

  // ── KPI DERIVATIONS (single chain: Opportunity = Optimized − Current; Uplift % = Opportunity / Current)
  const currentAllocationRevenue = projectedPlan.totalRevenue;
  const optimizedRevenue = recommendedPlan.totalRevenue;
  const { revenueOpportunity, upliftPct, isNearOptimal } = computeRevenueUpliftMetrics(
    currentAllocationRevenue,
    optimizedRevenue,
  );
  const currentAllocationROAS = totalPlannedBudget > 0 ? currentAllocationRevenue / totalPlannedBudget : 0;
  const optimizedROAS = totalPlannedBudget > 0 ? optimizedRevenue / totalPlannedBudget : 0;

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

  // ── Per-channel reasoning (data-driven, for “AI vs historical spend” panel) ──
  const channelReasons = useMemo(() => {
    if (summaries.length === 0 || models.length === 0) return {};
    const refROAS = portfolioWeightedROAS > 0
      ? portfolioWeightedROAS
      : summaries.reduce((s, c) => s + c.roas, 0) / (summaries.length || 1);
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
      const isHighROAS = summary.roas > refROAS * 1.2;
      const isLowROAS = summary.roas < refROAS * 0.8;
      const peakMonthName = sea ? MONTH_NAMES[sea.peakMonth] : '';
      const bestDayName = dow ? DOW_NAMES[dow.bestDay] : '';
      const hasCap = cap && Number.isFinite(cap.capSpend);
      const isNearCap = hasCap && optSpend >= cap!.capSpend * 0.85;
      const isIncreased = optPct > curPct + 3;
      const isReduced = optPct < curPct - 3;
      let reason = '';
      if (isHighROAS && isIncreased) {
        reason = `Strongest historical efficiency at ${summary.roas.toFixed(1)}x ROAS (${Math.round((summary.roas/refROAS-1)*100)}% above average). Increased because returns remain strong with additional spend.`;
      } else if (isHighROAS && !isIncreased) {
        reason = `High efficiency at ${summary.roas.toFixed(1)}x ROAS. Allocation held steady — already near optimal share for this channel.`;
      } else if (isLowROAS && isReduced) {
        reason = `Below-average ROAS of ${summary.roas.toFixed(1)}x (portfolio avg ${refROAS.toFixed(1)}x). Reduced to redirect budget toward higher-performing channels.`;
      } else if (isLowROAS) {
        reason = `ROAS of ${summary.roas.toFixed(1)}x sits below portfolio average. Budget held modest to avoid diluting overall return.`;
      } else if (isNearCap && hasCap) {
        reason = `Allocation limited near ${formatINRCompact(cap!.capSpend)}/mo — returns flatten at higher spend. Budget redistributed to channels with more headroom.`;
      } else if (sea && sea.peakBoost > 0.12) {
        reason = `${summary.roas.toFixed(1)}x ROAS with strong seasonality — peaks in ${peakMonthName} (+${Math.round(sea.peakBoost*100)}% uplift). Budget weighted toward peak months.`;
      } else if (dow && dow.weekendBias !== 'neutral') {
        reason = `${summary.roas.toFixed(1)}x ROAS, in line with average. Strongest on ${bestDayName}s — bid concentration improves efficiency.`;
      } else {
        reason = `${summary.roas.toFixed(1)}x ROAS (near portfolio average of ${refROAS.toFixed(1)}x). Allocation reflects proportional historical return.`;
      }
      reasons[ch] = reason;
    }
    return reasons;
  }, [summaries, models, seasonality, dowMetrics, optimalFractions, currentFractions, safeBudget, channelCapByName, portfolioWeightedROAS]);

  // ── Determine channel action for rationale section ─────────────────────────
  const channelActions = useMemo(() => {
    const actions: Record<string, { action: 'increase' | 'reduce' | 'hold'; importance: number }> = {};
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

  // Top 5 recommendations sorted by absolute percentage delta (the most important reallocations)
  const topRecommendations = useMemo(() => {
    return CHANNELS
      .filter(ch => channelActions[ch]?.action !== 'hold')
      .sort((a, b) => {
        const deltaA = Math.abs((optimalFractions[a] || 0) - (currentFractions[a] || 0));
        const deltaB = Math.abs((optimalFractions[b] || 0) - (currentFractions[b] || 0));
        return deltaB - deltaA;
      })
      .slice(0, 5);
  }, [optimalFractions, currentFractions, channelActions]);

  const remainingRecommendations = useMemo(() => {
    return CHANNELS
      .filter(ch => !topRecommendations.includes(ch))
      .sort((a, b) => {
        const deltaA = Math.abs((optimalFractions[a] || 0) - (currentFractions[a] || 0));
        const deltaB = Math.abs((optimalFractions[b] || 0) - (currentFractions[b] || 0));
        return deltaB - deltaA;
      });
  }, [optimalFractions, currentFractions, topRecommendations]);

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
      historical: parseFloat((((currentFractions[ch] || 0) * 100)).toFixed(1)),
      current: parseFloat((((projectedPlan.channelShares[ch] || 0) * 100)).toFixed(1)),
      optimal: parseFloat(((optimalFractions[ch] || 0) * 100).toFixed(1)),
    })),
  [currentFractions, projectedPlan.channelShares, optimalFractions]);

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

  const toggleManualRowExpand = (ch: string) => {
    setExpandedManualRows((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  };

  const allocationDeltaLeaders = useMemo(() => {
    return CHANNELS.map((ch) => ({
      ch,
      delta: Math.abs((optimalFractions[ch] || 0) - (projectedPlan.channelShares[ch] || 0)) * 100,
    }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3)
      .filter((x) => x.delta >= 0.4);
  }, [optimalFractions, projectedPlan.channelShares]);

  const efficiencyBadgeStyles: Record<
    MixChannelEfficiency,
    { label: string; color: string; bg: string }
  > = {
    saturated: { label: 'Saturated', color: '#F87171', bg: 'rgba(248,113,113,0.1)' },
    'under-scaled': { label: 'Under-scaled', color: '#34D399', bg: 'rgba(52,211,153,0.1)' },
    'over-scaled': { label: 'Over-scaled', color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
    efficient: { label: 'Efficient', color: '#60A5FA', bg: 'rgba(96,165,250,0.1)' },
  };

  const getEfficiencyBadge = (ch: string) => {
    const summary = summaryByChannel[ch];
    const cap = channelCapByName[ch];
    const model = models.find((m) => m.channel === ch);
    if (!summary || !model) return { label: '—', color: 'var(--text-muted)', bg: 'transparent' };

    const tier = classifyMixChannelEfficiency({
      optimalFraction: optimalFractions[ch] || 0,
      manualFraction: projectedPlan.channelShares[ch] || 0,
      model,
      cap,
      portfolioAvgROAS: portfolioWeightedROAS,
      monthlyBudget: safeBudget,
      summaryROAS: summary.roas,
      periodTimeWeightSum: periodWeightSums[ch] ?? 1,
    });
    return efficiencyBadgeStyles[tier];
  };

  // ── Allocation health score (0–100) ─────────────────────────────────────
  // 100 = current allocation is identical to optimized; 0 = maximum theoretical gap
  const allocationHealthScore = (() => {
    if (currentAllocationRevenue <= 0) return 0;
    const upliftFraction = revenueOpportunity / currentAllocationRevenue;
    return Math.round(Math.max(0, Math.min(100, 100 - upliftFraction * 100)));
  })();

  // ── Largest risk channel (priority: saturated > over-scaled > under-scaled > efficient) ──
  const largestRiskChannel = (() => {
    const priority: Record<string, number> = { saturated: 4, 'over-scaled': 3, 'under-scaled': 2, efficient: 1 };
    let worst = CHANNELS[0];
    let worstScore = 0;
    for (const ch of CHANNELS) {
      const summary = summaryByChannel[ch];
      const cap = channelCapByName[ch];
      const model = models.find((m) => m.channel === ch);
      if (!summary || !model) continue;
      const tier = classifyMixChannelEfficiency({
        optimalFraction: optimalFractions[ch] || 0,
        manualFraction: projectedPlan.channelShares[ch] || 0,
        model, cap,
        portfolioAvgROAS: portfolioWeightedROAS,
        monthlyBudget: safeBudget,
        summaryROAS: summary.roas,
        periodTimeWeightSum: periodWeightSums[ch] ?? 1,
      });
      if ((priority[tier] || 0) > worstScore) { worst = ch; worstScore = priority[tier] || 0; }
    }
    return worst;
  })();

  // ── Channel diagnosis (over/under weighted vs optimal) ───────────────────
  const overWeightedChannels = CHANNELS.filter(ch => {
    const your = (projectedPlan.channelShares[ch] || 0) * 100;
    const ai   = (optimalFractions[ch] || 0) * 100;
    return your > ai + 4;
  });
  const underWeightedChannels = CHANNELS.filter(ch => {
    const your = (projectedPlan.channelShares[ch] || 0) * 100;
    const ai   = (optimalFractions[ch] || 0) * 100;
    return your < ai - 4;
  });

  if (isLoading) return <DashboardSkeleton />;

  // ── DESIGN TOKENS ─────────────────────────────────────────────────────────
  // Typography tiers (strict 3-level hierarchy)
  const T = {
    overline: { fontFamily: 'Outfit' as const, fontSize: 11, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0 } as const,
    value:    { fontFamily: 'Outfit' as const, fontWeight: 700 as const, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0, fontFeatureSettings: '"tnum"' as const } as const,
    helper:   { fontFamily: 'Plus Jakarta Sans' as const, fontSize: 13, fontWeight: 400 as const, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 } as const,
  };
  // Spacing scale: 4 / 8 / 12 / 16 / 24 / 32
  const CARD_PADDING = '20px 24px';
  const CARD_RADIUS = 14;
  const CARD_BORDER = '1px solid var(--border-subtle)';

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

  const viewTabStyle = (active: boolean) => ({
    flex: 1, fontFamily: 'Outfit' as const, fontSize: 13, fontWeight: 700 as const,
    padding: '10px 20px', borderRadius: 10, cursor: 'pointer' as const, transition: '150ms',
    border: 'none',
    backgroundColor: active ? 'var(--text-primary)' : 'transparent',
    color: active ? 'var(--bg-root)' : 'var(--text-muted)',
  });

  return (
    <div className="mobile-page mix-page space-y-6" style={{ maxWidth: 1320 }}>
      {/* HEADER */}
      <div className="mobile-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>
            Marketing Mix Optimizer
          </h1>
          <p style={{ ...T.helper, marginTop: 4 }}>
            ₹50L/mo portfolio · 10 channels · modelled forecasts (not raw daily realized totals)
          </p>
          <p style={{ ...T.helper, fontSize: 11, marginTop: 6, color: 'var(--text-muted)' }}>
            Data: {dataDateRange ? `${dataDateRange.min} → ${dataDateRange.max}` : '—'}
            {' · '}
            Source: {dataSource === 'api' ? 'API' : dataSource === 'cached' ? 'Cache' : dataSource === 'mock' ? 'Sample' : '—'}
            {dataUpdatedAt ? ` · Loaded ${new Date(dataUpdatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
          </p>
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
          style={{ 
            backgroundColor: 'var(--bg-card)', 
            border: CARD_BORDER, 
            borderRadius: 10,
            color: 'var(--text-primary)',
            fontFamily: 'Outfit',
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'transform 120ms',
          }}
        >
          <Download size={15} />
          Export
        </button>
      </div>

      {/* Control Bar */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: CARD_PADDING }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...T.overline, marginBottom: 8 }}>Monthly Budget</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
              <input
                type="number"
                value={safeBudget}
                min={0}
                step={1000}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  setBudget(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                }}
                onBlur={() => setBudget((b) => Math.round(Math.max(0, b) / 1000) * 1000)}
                style={{ flex: 1, minWidth: 110, background: 'transparent', border: 'none', outline: 'none', ...T.value, fontSize: 18 }}
              />
            </div>
            <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{formatINR(safeBudget)}</span>/mo · {formatINRCompact(totalPlannedBudget)} total for selected period
            </p>
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={{ ...T.overline, marginBottom: 8 }}>Planning Period</p>
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
                <span style={{ ...T.overline, fontSize: 10, letterSpacing: 0 }}>to</span>
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
            <p style={{ ...T.overline, marginBottom: 8 }}>Planning Mode</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { value: 'conservative', label: 'Conservative' },
                { value: 'target', label: 'Target' },
                { value: 'aggressive', label: 'Aggressive' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setPlanningMode(mode.value as PlanningMode)}
                  style={{
                    fontFamily: 'Outfit',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: planningMode === mode.value ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                    backgroundColor: planningMode === mode.value ? 'var(--bg-root)' : 'transparent',
                    color: planningMode === mode.value ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: '120ms',
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* VIEW TAB SWITCHER */}
      <div style={{ display: 'flex', gap: 4, backgroundColor: 'var(--bg-card)', borderRadius: 12, padding: 4, border: CARD_BORDER }}>
        <button style={viewTabStyle(activeView === 'current')} onClick={() => setActiveView('current')}>
          Current Allocation
        </button>
        <button style={viewTabStyle(activeView === 'ai')} onClick={() => setActiveView('ai')}>
          AI Recommendation
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          VIEW 1 — CURRENT / MANUAL ALLOCATION
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeView === 'current' && (<>

      {/* KPI STRIP — diagnose current state only */}
      {/* ── VIEW 1 KPI strip: current-only ── */}
      <div className="mix-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          {
            label: 'Current revenue (forecast)',
            value: formatINRCompact(currentAllocationRevenue),
            foot: 'Modelled revenue for your current allocation — seasonality × DOW.',
            accent: '#60A5FA',
          },
          {
            label: 'Blended ROAS',
            value: `${currentAllocationROAS.toFixed(2)}x`,
            foot: 'Period forecast revenue ÷ period budget. Not raw daily ROAS.',
            accent: '#E8803A',
          },
          {
            label: 'Active channels',
            value: `${activeChannels.length} / 10`,
            foot: 'Channels currently receiving budget in your mix.',
            accent: '#A78BFA',
          },
          {
            label: 'Allocation health',
            value: `${allocationHealthScore}`,
            sub: allocationHealthScore >= 85 ? 'Near-optimal' : allocationHealthScore >= 60 ? 'Room to improve' : 'Significant gaps',
            foot: 'How close your current mix is to the AI-optimized allocation (100 = identical).',
            accent: allocationHealthScore >= 85 ? '#34D399' : allocationHealthScore >= 60 ? '#FBBF24' : '#F87171',
          },
          {
            label: 'Largest risk channel',
            value: largestRiskChannel,
            sub: (() => { const b = getEfficiencyBadge(largestRiskChannel); return b.label; })(),
            foot: 'Channel classified as highest priority for reallocation review.',
            accent: getEfficiencyBadge(largestRiskChannel).color,
          },
        ].map((kpi, idx) => (
          <div key={kpi.label} className="card-enter" style={{
            backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS,
            padding: CARD_PADDING, animationDelay: `${idx * 60}ms`,
          }}>
            <p style={T.overline}>{kpi.label}</p>
            <p style={{ ...T.value, fontSize: 24, fontWeight: 800, marginTop: 4 }}>{kpi.value}</p>
            {kpi.sub && <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: kpi.accent, margin: '2px 0 0 0' }}>{kpi.sub}</p>}
            {'foot' in kpi && kpi.foot && <p style={{ ...T.helper, fontSize: 10, marginTop: 8, lineHeight: 1.45 }}>{kpi.foot}</p>}
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: 12, opacity: 0.35 }} />
          </div>
        ))}
      </div>

      {/* ── VIEW 1 ALLOCATION TABLE (read-only + optional edit mode) ── */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={T.overline}>Channel Allocation</p>
            <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>
              {editMode ? 'Drag sliders to adjust budget weights — click a row for deeper detail.' : 'Your current budget mix · click a row to expand · toggle Edit to adjust sliders.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {editMode && (
              <button type="button" onClick={resetToCurrent} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, backgroundColor: 'var(--bg-root)', color: 'var(--text-muted)', border: CARD_BORDER, cursor: 'pointer' }}>
                Reset
              </button>
            )}
            <button type="button" onClick={() => setEditMode(!editMode)} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, backgroundColor: editMode ? '#34D399' : 'var(--bg-root)', color: editMode ? '#000' : 'var(--text-primary)', border: editMode ? 'none' : CARD_BORDER, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {editMode ? <><CheckCircle size={13} /> Done editing</> : <><Sliders size={13} /> Edit allocation</>}
            </button>
          </div>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(130px,1.3fr) 44px 52px 80px 80px 54px minmax(70px,0.8fr) 28px',
          padding: '10px 24px', gap: 8,
          backgroundColor: 'var(--bg-root)', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
        }}>
          {['Channel', 'Hist', 'Yours', 'Spend', 'Revenue', 'ROAS', 'Status', ''].map((h) => (
            <span key={h} style={{ ...T.overline, fontSize: 10, textAlign: h !== 'Channel' && h !== '' ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>

        {CHANNELS.map((ch, ci) => {
          const yourPct = Math.round((projectedPlan.channelShares[ch] || 0) * 100);
          const histPct = Math.round((currentFractions[ch] || 0) * 100);
          const badge = getEfficiencyBadge(ch);
          const color = CHANNEL_COLORS[ci];
          const isExpanded = expandedRows.has(ch);
          const cap = channelCapByName[ch];
          const summary = summaryByChannel[ch];
          const sea = seasonality.find(s => s.channel === ch);
          const dow = dowMetrics.find(d => d.channel === ch);
          const reason = channelReasons[ch];
          const model = models.find((m) => m.channel === ch);
          const periodW = periodWeightSums[ch] ?? 1;
          const monthlySpendUser = durationMonthCount > 0 ? (projectedPlan.channelTotals[ch]?.spend || 0) / durationMonthCount : 0;
          const periodSpendUser = projectedPlan.channelTotals[ch]?.spend || 0;
          const revUser = projectedPlan.channelTotals[ch]?.revenue || 0;
          const marg = model ? getPeriodicMarginalROAS(model, monthlySpendUser, periodW) : 0;
          const chROAS = periodSpendUser > 0 ? revUser / periodSpendUser : 0;
          const isPaused = paused.has(ch);
          const pct = Math.round((alloc[ch] || 0) * 100);

          return (
            <div key={ch} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: isPaused ? 0.5 : 1, transition: 'opacity 200ms' }}>
              {/* Summary row */}
              <button type="button" onClick={() => toggleRowExpand(ch)} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(130px,1.3fr) 44px 52px 80px 80px 54px minmax(70px,0.8fr) 28px',
                padding: '12px 24px', gap: 8, alignItems: 'center', cursor: 'pointer',
                transition: 'background-color 120ms', width: '100%', border: 'none',
                background: 'transparent', textAlign: 'left',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--border-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                </div>
                <span style={{ fontFamily: 'Outfit', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }} title="Historical spend share">{histPct}%</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{yourPct}%</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>{formatINRCompact(periodSpendUser)}</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color, textAlign: 'center' }}>{formatINRCompact(revUser)}</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{chROAS.toFixed(2)}x</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 10, fontWeight: 700, color: badge.color, backgroundColor: badge.bg, padding: '4px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', justifySelf: 'start' }}>
                  {badge.label}
                </span>
                <span style={{ display: 'flex', justifyContent: 'center' }}>
                  {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                </span>
              </button>

              {/* Edit mode: slider + pause switch */}
              {editMode && (
                <div style={{ padding: '0 24px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Switch checked={!isPaused} onCheckedChange={() => togglePause(ch)} />
                  <div onClick={(e) => e.stopPropagation()} style={{ flex: 1 }}>
                    <Slider value={[pct]} min={0} max={60} step={1} onValueChange={(v) => handleSlider(ch, v)} disabled={isPaused} />
                  </div>
                  <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 24px 18px 24px', animation: 'card-enter 200ms ease both' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)' }}>
                      <p style={{ ...T.overline, fontSize: 10, marginBottom: 10 }}>Performance</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          ['Period spend', formatINRCompact(periodSpendUser)],
                          ['Period revenue (forecast)', formatINRCompact(revUser)],
                          ['Channel ROAS (forecast)', `${chROAS.toFixed(2)}x`],
                          ['Marginal ROAS (period)', `${marg.toFixed(2)}x`],
                          ['Historical ROAS', summary ? `${summary.roas.toFixed(2)}x` : '—'],
                        ].map(([label, value]) => (
                          <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span style={{ ...T.helper, fontSize: 12 }}>{label}</span>
                            <span style={{ ...T.value, fontSize: 13 }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)' }}>
                      <p style={{ ...T.overline, fontSize: 10, marginBottom: 10 }}>Timing</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sea && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Peak month</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][sea.peakMonth]}</span>
                        </div>}
                        {dow && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Best day</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow.bestDay]}</span>
                        </div>}
                        {cap && Number.isFinite(cap.capSpend) && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Saturation cap</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{formatINRCompact(cap.capSpend)}/mo</span>
                        </div>}
                      </div>
                    </div>
                    {reason && (
                      <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)', gridColumn: 'span 2' }}>
                        <p style={{ ...T.overline, fontSize: 10, marginBottom: 8 }}>Diagnosis</p>
                        <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {editMode && (
          <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: Math.abs(totalPct - 1) > 0.01 ? '#F87171' : '#34D399' }}>
              Total: {Math.round(totalPct * 100)}%
            </span>
            <button type="button" onClick={applyOptimal} style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={12} /> Apply AI Mix
            </button>
          </div>
        )}
      </div>

      {/* ── VIEW 1 DIAGNOSIS BOX + CTA ── */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: CARD_PADDING }}>
        <p style={{ ...T.overline, marginBottom: 14 }}>Current mix diagnosis</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(251,191,36,0.3)', backgroundColor: 'rgba(251,191,36,0.05)' }}>
            <p style={{ ...T.overline, fontSize: 10, color: '#FBBF24', marginBottom: 8 }}>Over-weighted channels</p>
            {overWeightedChannels.length === 0
              ? <p style={{ ...T.helper, fontSize: 12 }}>None — all channels are within tolerance.</p>
              : overWeightedChannels.map(ch => (
                  <p key={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>
                    {ch} — {Math.round((projectedPlan.channelShares[ch] || 0) * 100)}% vs {Math.round((optimalFractions[ch] || 0) * 100)}% AI
                  </p>
                ))
            }
          </div>
          <div style={{ borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(96,165,250,0.3)', backgroundColor: 'rgba(96,165,250,0.05)' }}>
            <p style={{ ...T.overline, fontSize: 10, color: '#60A5FA', marginBottom: 8 }}>Under-weighted channels</p>
            {underWeightedChannels.length === 0
              ? <p style={{ ...T.helper, fontSize: 12 }}>None — all channels are within tolerance.</p>
              : underWeightedChannels.map(ch => (
                  <p key={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>
                    {ch} — {Math.round((projectedPlan.channelShares[ch] || 0) * 100)}% vs {Math.round((optimalFractions[ch] || 0) * 100)}% AI
                  </p>
                ))
            }
          </div>
          <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
            <p style={{ ...T.overline, fontSize: 10, marginBottom: 4 }}>Health score</p>
            <div>
              <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--border-subtle)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${allocationHealthScore}%`, borderRadius: 3, background: allocationHealthScore >= 85 ? '#34D399' : allocationHealthScore >= 60 ? '#FBBF24' : '#F87171', transition: 'width 600ms ease' }} />
              </div>
              <p style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{allocationHealthScore}/100</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setActiveView('ai')}
          style={{ width: '100%', padding: '14px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: '#000', fontFamily: 'Outfit', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Sparkles size={15} /> View AI Recommendation <ArrowUpRight size={15} />
        </button>
      </div>

      </>) /* end View 1 */}


      {/* ═══════════════════════════════════════════════════════════════════════
          VIEW 2 — AI RECOMMENDATION
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeView === 'ai' && (<>

      {/* ── VIEW 2 KPI strip: current vs recommended ── */}
      <div className="mix-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Current revenue', value: formatINRCompact(currentAllocationRevenue), foot: 'Forecast for your current slider mix.', accent: '#60A5FA' },
          { label: 'Recommended revenue', value: formatINRCompact(optimizedRevenue), foot: 'Forecast for AI-recommended mix — same model.', accent: '#34D399' },
          {
            label: 'Revenue opportunity',
            value: `${revenueOpportunity >= 0 ? '+' : ''}${formatINRCompact(revenueOpportunity)}`,
            sub: `${upliftPct >= 0 ? '+' : ''}${upliftPct.toFixed(2)}% uplift`,
            foot: 'Recommended minus current (both modelled forecasts).',
            accent: revenueOpportunity >= 0 ? '#34D399' : '#F87171',
          },
          { label: 'Current ROAS', value: `${currentAllocationROAS.toFixed(2)}x`, foot: 'Period revenue ÷ budget for your mix.', accent: '#E8803A' },
          { label: 'Recommended ROAS', value: `${optimizedROAS.toFixed(2)}x`, foot: 'Period revenue ÷ budget for AI mix.', accent: '#FBBF24' },
        ].map((kpi, idx) => (
          <div key={kpi.label} className="card-enter" style={{
            backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS,
            padding: CARD_PADDING, animationDelay: `${idx * 60}ms`,
          }}>
            <p style={T.overline}>{kpi.label}</p>
            <p style={{ ...T.value, fontSize: 24, fontWeight: 800, marginTop: 4 }}>{kpi.value}</p>
            {kpi.sub && <p style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: kpi.accent, margin: '2px 0 0 0' }}>{kpi.sub}</p>}
            <p style={{ ...T.helper, fontSize: 10, marginTop: 8, lineHeight: 1.45 }}>{kpi.foot}</p>
            <div style={{ height: 2, backgroundColor: kpi.accent, borderRadius: 1, marginTop: 12, opacity: 0.35 }} />
          </div>
        ))}
      </div>

      {/* ── VIEW 2 OPPORTUNITY / NEAR-OPTIMAL BANNER ── */}
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — OPPORTUNITY BANNER
          ═══════════════════════════════════════════════════════════════════════ */}
      {!isNearOptimal && revenueOpportunity > Math.max(5000, Math.abs(currentAllocationRevenue) * 0.0025) ? (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid rgba(52, 211, 153, 0.3)',
          borderRadius: CARD_RADIUS,
          padding: CARD_PADDING,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          backgroundImage: 'linear-gradient(135deg, rgba(52, 211, 153, 0.04), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(52, 211, 153, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrendingUp size={22} color="#34D399" />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...T.value, fontSize: 18 }}>
                {formatINRCompact(revenueOpportunity)} revenue opportunity
              </p>
              <p style={{ ...T.helper, fontSize: 13, marginTop: 4 }}>
                Opportunity = Optimized − Current · ROAS {currentAllocationROAS.toFixed(2)}x → {optimizedROAS.toFixed(2)}x · +{upliftPct.toFixed(2)}% uplift over {durationLabel}
              </p>
            </div>
          </div>
          <button
            onClick={applyOptimal}
            style={{
              padding: '10px 20px',
              backgroundColor: '#34D399',
              color: '#000',
              fontFamily: 'Outfit',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
              transition: 'transform 120ms',
            }}
          >
            Apply <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: CARD_BORDER,
          borderRadius: CARD_RADIUS,
          padding: CARD_PADDING,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle size={22} color="var(--text-muted)" />
          </div>
          <div>
            <p style={{ ...T.value, fontSize: 16 }}>
              {isNearOptimal ? 'Current allocation already matches the optimized forecast closely' : 'Incremental lift from rebalancing is modest'}
            </p>
            <p style={{ ...T.helper, fontSize: 13, marginTop: 4 }}>
              Current Allocation Revenue {formatINRCompact(currentAllocationRevenue)} vs Optimized {formatINRCompact(optimizedRevenue)}
              {' · '}
              {isNearOptimal
                ? `Difference within tolerance (Δ ${formatINRCompact(revenueOpportunity)}, ${upliftPct >= 0 ? '+' : ''}${upliftPct.toFixed(2)}%).`
                : `Blended ROAS ${currentAllocationROAS.toFixed(2)}x vs ${optimizedROAS.toFixed(2)}x · opportunity ${formatINRCompact(revenueOpportunity)}.`}
            </p>
            {isNearOptimal && (
              <p style={{ ...T.helper, fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
                KPI uplift compares <strong style={{ color: 'var(--text-secondary)' }}>your slider forecast vs AI forecast</strong>.
                “Why allocation” compares <strong style={{ color: 'var(--text-secondary)' }}>AI vs historical spend mix</strong> — they use different baselines, so uplift can be ~0 while AI still diverges from history.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW 2 TOP CHANGES SUMMARY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { title: 'Top increases', channels: CHANNELS.filter(ch => (optimalFractions[ch] || 0) - (projectedPlan.channelShares[ch] || 0) >= 0.04).sort((a, b) => ((optimalFractions[b] || 0) - (projectedPlan.channelShares[b] || 0)) - ((optimalFractions[a] || 0) - (projectedPlan.channelShares[a] || 0))).slice(0, 3), color: '#34D399', bgColor: 'rgba(52,211,153,0.07)', borderColor: 'rgba(52,211,153,0.25)', Icon: TrendingUp },
          { title: 'Top reductions', channels: CHANNELS.filter(ch => (projectedPlan.channelShares[ch] || 0) - (optimalFractions[ch] || 0) >= 0.04).sort((a, b) => ((projectedPlan.channelShares[b] || 0) - (optimalFractions[b] || 0)) - ((projectedPlan.channelShares[a] || 0) - (optimalFractions[a] || 0))).slice(0, 3), color: '#F87171', bgColor: 'rgba(248,113,113,0.07)', borderColor: 'rgba(248,113,113,0.25)', Icon: TrendingDown },
        ].map(({ title, channels, color, bgColor, borderColor, Icon }) => (
            <div key={title} style={{ borderRadius: CARD_RADIUS, border: `1px solid ${borderColor}`, padding: CARD_PADDING, backgroundColor: bgColor }}>
            <p style={{ ...T.overline, color, marginBottom: 12 }}>{title}</p>
            {channels.length === 0 ? (
              <p style={{ ...T.helper, fontSize: 12 }}>No channels meet the threshold for this category.</p>
            ) : channels.map((ch, i) => {
              const yourPct = Math.round((projectedPlan.channelShares[ch] || 0) * 100);
              const aiPct = Math.round((optimalFractions[ch] || 0) * 100);
              const delta = aiPct - yourPct;
              return (
                <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < channels.length - 1 ? 10 : 0 }}>
                  <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ch}</span>
                    <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color, marginLeft: 8 }}>{delta > 0 ? '+' : ''}{delta}%</span>
                  </div>
                  <span style={{ fontFamily: 'Outfit', fontSize: 12, color: 'var(--text-muted)' }}>{yourPct}% → {aiPct}%</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── VIEW 2 CHANNEL COMPARISON TABLE ── */}
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — ALLOCATION COMPARISON TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: CARD_BORDER,
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={T.overline}>Channel-by-channel comparison</p>
              <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>
                Hist = historical spend mix · Yours = your sliders · AI = optimizer — tap a row for rationale and detail.
              </p>
            </div>
            <button onClick={applyOptimal} style={{
              fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg, #E8803A, #FBBF24)', color: 'var(--bg-root)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Sparkles size={12} /> Apply AI Mix
            </button>
          </div>
          <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />
        </div>

        {/* Table header — compact summary columns only */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px,1.35fr) 42px 48px 48px 44px minmax(68px,0.85fr) 28px',
          padding: '10px 24px',
          gap: 8,
          backgroundColor: 'var(--bg-root)',
          borderBottom: '1px solid var(--border-subtle)',
          alignItems: 'center',
        }}>
          {['Channel', 'Hist', 'Yours', 'AI', 'Gap', 'Status', ''].map((h) => (
            <span key={h} style={{ ...T.overline, fontSize: 10, textAlign: h !== 'Channel' && h !== '' ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>

        {/* Channel accordion rows */}
        {CHANNELS.map((ch, ci) => {
          const yourPct = Math.round((projectedPlan.channelShares[ch] || 0) * 100);
          const histPct = Math.round((currentFractions[ch] || 0) * 100);
          const optPct = Math.round((optimalFractions[ch] || 0) * 100);
          const delta = optPct - yourPct;
          const badge = getEfficiencyBadge(ch);
          const color = CHANNEL_COLORS[ci];
          const isExpanded = expandedRows.has(ch);
          const cap = channelCapByName[ch];
          const summary = summaryByChannel[ch];
          const sea = seasonality.find(s => s.channel === ch);
          const dow = dowMetrics.find(d => d.channel === ch);
          const reason = channelReasons[ch];
          const model = models.find((m) => m.channel === ch);
          const periodW = periodWeightSums[ch] ?? 1;
          const monthlySpendUser = durationMonthCount > 0
            ? (projectedPlan.channelTotals[ch]?.spend || 0) / durationMonthCount
            : 0;
          const periodSpendUser = projectedPlan.channelTotals[ch]?.spend || 0;
          const revUser = projectedPlan.channelTotals[ch]?.revenue || 0;
          const revOptCh = recommendedPlan.channelTotals[ch]?.revenue || 0;
          const marg = model
            ? getPeriodicMarginalROAS(model, monthlySpendUser, periodW)
            : 0;
          const dimNote = cap
            ? (Number.isFinite(cap.capSpend) && cap.bucketROAS.high > 0 && cap.bucketROAS.high < cap.blendedROAS
                ? 'Higher historical spend tiers show weaker ROAS than your blended average — extra budget hits diminishing returns.'
                : cap.capReason.length > 140 ? `${cap.capReason.slice(0, 137)}…` : cap.capReason)
            : 'No saturation diagnostics for this channel.';

          return (
            <div key={ch} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {/* Collapsed summary — decision-focused only */}
              <button
                type="button"
                onClick={() => toggleRowExpand(ch)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px,1.35fr) 42px 48px 48px 44px minmax(68px,0.85fr) 28px',
                  padding: '12px 24px',
                  gap: 8,
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 120ms',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--border-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <ChannelName channel={ch} style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} />
                </div>
                <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }} title="Historical spend mix">{histPct}%</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>{yourPct}%</span>
                <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{optPct}%</span>
                <span style={{
                  fontFamily: 'Outfit', fontSize: 12, fontWeight: 600, textAlign: 'center',
                  color: delta > 0 ? '#34D399' : delta < 0 ? '#F87171' : 'var(--text-muted)',
                }}>
                  {delta > 0 ? '+' : ''}{delta}%
                </span>
                <span style={{
                  fontFamily: 'Outfit', fontSize: 10, fontWeight: 700,
                  color: badge.color, backgroundColor: badge.bg,
                  padding: '4px 8px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap', justifySelf: 'start',
                }}>
                  {badge.label}
                </span>
                <span style={{ display: 'flex', justifyContent: 'center' }}>
                  {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                </span>
              </button>

              {/* Expanded detail — grouped Performance / Logic / Timing */}
              {isExpanded && (
                <div style={{
                  padding: '0 24px 18px 24px',
                  animation: 'card-enter 200ms ease both',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 14,
                  }}>
                    <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)' }}>
                      <p style={{ ...T.overline, fontSize: 10, marginBottom: 10 }}>Performance</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Projected spend (period)</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{formatINRCompact(periodSpendUser)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Monthly spend (your mix)</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{formatINRCompact(monthlySpendUser)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Expected revenue (your mix)</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{formatINRCompact(revUser)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Expected revenue (AI mix)</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{formatINRCompact(revOptCh)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Marginal ROAS (period)</span>
                          <span style={{ ...T.value, fontSize: 13 }}>{marg.toFixed(2)}x</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...T.helper, fontSize: 12 }}>Historical ROAS</span>
                          <span style={{ ...T.value, fontSize: 13, color }}>{summary ? `${summary.roas.toFixed(2)}x` : '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)' }}>
                      <p style={{ ...T.overline, fontSize: 10, marginBottom: 10 }}>Recommendation logic</p>
                      <p style={{ ...T.helper, fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Status · </strong>
                        {badge.label} vs your {yourPct}% / AI {optPct}%.
                      </p>
                      <p style={{ ...T.helper, fontSize: 12, lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Diminishing returns · </strong>
                        {dimNote}
                      </p>
                      <p style={{ ...T.helper, fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
                        Historical avg. mix {histPct}% · Saturation cap {cap && Number.isFinite(cap.capSpend) ? formatINRCompact(cap.capSpend) : 'none'}.
                      </p>
                    </div>

                    <div style={{ borderRadius: 10, padding: '12px 14px', border: CARD_BORDER, backgroundColor: 'var(--bg-root)' }}>
                      <p style={{ ...T.overline, fontSize: 10, marginBottom: 10 }}>Timing insights</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Sun size={14} style={{ color: '#FBBF24', flexShrink: 0 }} />
                          <span style={{ ...T.helper, fontSize: 12 }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>Best day · </strong>
                            {dow ? DOW_NAMES_SHORT[dow.bestDay] : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Calendar size={14} style={{ color: '#60A5FA', flexShrink: 0 }} />
                          <span style={{ ...T.helper, fontSize: 12 }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>Peak season · </strong>
                            {sea ? MONTH_NAMES_SHORT[sea.peakMonth] : '—'}
                          </span>
                        </div>
                        {reason && (
                          <p style={{ ...T.helper, fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                            <strong style={{ color: '#E8803A' }}>Rationale · </strong>
                            {reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — WHY THIS ALLOCATION (progressive disclosure)
          ═══════════════════════════════════════════════════════════════════════ */}
      {Object.keys(channelReasons).length > 0 && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: CARD_BORDER,
          borderRadius: CARD_RADIUS,
          overflow: 'hidden',
        }}>
          <button
            type="button"
            onClick={() => setShowWhyAllocation(!showWhyAllocation)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: CARD_PADDING,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Lightbulb size={18} style={{ color: '#FBBF24', flexShrink: 0 }} />
              <div>
                <p style={T.overline}>AI vs historical spend</p>
                <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>
                  {showWhyAllocation ? 'Hide narrative detail' : 'Why AI mix diverges from historical budget share (not the uplift row)'}
                </p>
              </div>
            </div>
            {showWhyAllocation ? <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
          </button>

          {showWhyAllocation && (
          <div style={{ padding: '0 24px 20px' }}>
          <p style={{ ...T.helper, fontSize: 12, marginBottom: 16 }}>
            Independent of KPI uplift: each channel compares <strong style={{ color: 'var(--text-secondary)' }}>AI recommended share</strong> to <strong style={{ color: 'var(--text-secondary)' }}>historical spend mix</strong>. Use Reset on sliders to align “your mix” with historical baseline.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {topRecommendations.map((ch, i) => {
              const act = channelActions[ch];
              const ci = CHANNELS.indexOf(ch);
              const color = CHANNEL_COLORS[ci];
              return (
                <div key={ch} className="card-enter" style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', borderRadius: 10,
                  backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)',
                  animationDelay: `${i * 50}ms`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {act.action === 'increase' ? <TrendingUp size={16} color="#34D399" /> : <TrendingDown size={16} color="#F87171" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ch}</span>
                      <span style={actionBadgeStyle(act.action)}>{act.action}</span>
                    </div>
                    <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                      {channelReasons[ch]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {remainingRecommendations.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllRationale(!showAllRationale)}
              style={{
                fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600,
                color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                marginTop: 14, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 0',
              }}
            >
              {showAllRationale ? 'Hide detailed reasons' : `Show all channels (${remainingRecommendations.length} more)`}
              {showAllRationale ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}

          {showAllRationale && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginTop: 12 }}>
              {remainingRecommendations.map((ch) => {
                const act = channelActions[ch];
                const ci = CHANNELS.indexOf(ch);
                const color = CHANNEL_COLORS[ci] || '#ccc';
                return (
                  <div key={ch} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)', opacity: 0.8
                  }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: `${color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'Outfit', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{ch}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{act.action}</span>
                      </div>
                      <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
                        {channelReasons[ch]}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 6 — EVIDENCE TABS (Why It Works | Diminishing | Best Days | Seasonal | Scenarios)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        <button style={evidenceTabStyle(evidenceTab === 'scenarios')} onClick={() => setEvidenceTab('scenarios')}>
          <BarChart3 size={13} /> Budget Scenarios
        </button>
      </div>

      {/* ── Allocation comparison chart (shown in Why It Works tab or always) ── */}
      {evidenceTab === 'why' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: CARD_PADDING }}>
            <p style={{ ...T.overline, marginBottom: 4 }}>How the optimizer works</p>
            <p style={{ ...T.helper, fontSize: 12, marginBottom: 24 }}>Four steps from raw data to recommendation</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { step: '01', title: 'Analyze historical efficiency', desc: 'Calculate ROAS for each channel across 3 years of daily data to establish baseline performance.', icon: BarChart3, color: '#60A5FA' },
                { step: '02', title: 'Detect saturation & diminishing returns', desc: 'Group spend into low/mid/high buckets. Identify channels where higher spend yields lower returns.', icon: TrendingDown, color: '#F87171' },
                { step: '03', title: 'Adjust for day & season patterns', desc: 'Each month applies channel-specific calendar seasonality and a day-of-week blend derived from historical ROAS indices.', icon: Calendar, color: '#FBBF24' },
                { step: '04', title: 'Reallocate toward highest marginal return', desc: 'Non-linear KKT allocation on fitted α with per-channel bounds; sparse channels get a tighter max share.', icon: Zap, color: '#34D399' },
              ].map((item, i) => (
                <div key={i} className="card-enter" style={{ backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 16px', animationDelay: `${i * 80}ms` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <item.icon size={15} style={{ color: item.color }} />
                    </div>
                    <span style={{ fontFamily: 'Outfit', fontSize: 11, fontWeight: 700, color: item.color }}>{item.step}</span>
                  </div>
                  <h3 style={{ fontFamily: 'Outfit', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{item.title}</h3>
                  <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Note: </strong>
                Forecast revenue multiplies the concave spend response by seasonality × day-of-week for each calendar month. Predictive estimates only — not guaranteed outcomes.
              </p>
            </div>
          </div>
          <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: CARD_PADDING }}>
            <p style={T.overline}>Allocation comparison chart</p>
            <p style={{ ...T.helper, fontSize: 12, marginTop: 8, marginBottom: 16, lineHeight: 1.5 }}>
              {allocationDeltaLeaders.length > 0
                ? <>Largest gaps vs AI: <strong style={{ color: 'var(--text-secondary)' }}>{allocationDeltaLeaders.map((x) => x.ch).join(', ')}</strong>.</>
                : 'Your mix is already close to the AI split across all channels.'}
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comparisonData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
                <XAxis dataKey="channel" tick={{ fontSize: 8, fill: 'var(--text-muted)', fontFamily: 'Plus Jakarta Sans' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={56} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]} />
                <Legend wrapperStyle={{ fontFamily: 'Plus Jakarta Sans', fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }} />
                <Bar dataKey="historical" fill="rgba(148,163,184,0.65)" name="Historical" radius={[3, 3, 0, 0]} />
                <Bar dataKey="current" fill="rgba(96,165,250,0.6)" name="Your mix" radius={[3, 3, 0, 0]} />
                <Bar dataKey="optimal" fill="rgba(232,128,58,0.85)" name="AI mix" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Budget Scenarios tab ── */}
      {evidenceTab === 'scenarios' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden' }}>
          <div style={{ padding: CARD_PADDING }}>
            <p style={T.overline}>Budget scenarios</p>
            <p style={{ ...T.helper, fontSize: 12, marginTop: 8 }}>
              At <strong style={{ color: 'var(--text-secondary)' }}>{formatINRCompact(BUDGET_SCENARIOS[1].value)}</strong>/mo (current tier), optimized portfolio revenue ≈{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{formatINRCompact(scenarioResults[1]?.revenue ?? 0)}</strong> over {durationLabel}.
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-root)' }}>
                {[scenarioBudgetLabel, 'Proj. Revenue', 'ROAS', `vs ${formatINRCompact((BUDGET_SCENARIOS[1]?.value ?? 0) * durationMonthCount)}`].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', ...T.overline, fontSize: 10, borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
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
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--border-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
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
          {scenarioIncrementalNote && (
            <p style={{ ...T.helper, fontSize: 11, lineHeight: 1.5, margin: 0, padding: '12px 16px 18px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-root)' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Marginal ROAS (forecast)</strong> between tiers:
              {' '}{scenarioIncrementalNote.labels.low}: <strong>{scenarioIncrementalNote.mLow.toFixed(2)}x</strong>;
              {' '}{scenarioIncrementalNote.labels.high}: <strong>{scenarioIncrementalNote.mHigh.toFixed(2)}x</strong>
              {' '}(+{formatINRCompact(scenarioIncrementalNote.deltaRevUpper)} on +{formatINRCompact(scenarioIncrementalNote.extraBudgetUpper)} vs mid tier).
            </p>
          )}
        </div>
      )}

      {/* ── WHY IT WORKS TAB ── */}
      {evidenceTab === 'why' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: CARD_PADDING }}>
          <p style={{ ...T.overline, marginBottom: 4 }}>How the optimizer works</p>
          <p style={{ ...T.helper, fontSize: 12, marginBottom: 24 }}>
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
                desc: 'Each month applies channel-specific calendar seasonality and a day-of-week blend derived from historical ROAS indices (distinct from naive average ROAS ranking).',
                icon: Calendar,
                color: '#FBBF24',
              },
              {
                step: '04',
                title: 'Reallocate toward highest marginal return',
                desc: 'Non-linear KKT allocation on fitted α with per-channel bounds; sparse channels get a tighter max share so the engine does not over-concentrate budget without evidence.',
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
              Forecast revenue multiplies that concave spend response by{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>seasonality × day-of-week</strong>{' '}
              for each calendar month in your planning window (same Σₘ factor the solver uses when maximizing total expected revenue under the monthly budget constraint). Predictive estimates only — not guaranteed outcomes.
            </p>
          </div>
        </div>
      )}

      {/* ── DIMINISHING RETURNS TAB ── */}
      {evidenceTab === 'diminishing' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: CARD_PADDING }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={T.overline}>Diminishing Returns</p>
              <p style={{ ...T.helper, fontSize: 12, marginTop: 4 }}>
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
                    <div key={kpi.label} style={{ backgroundColor: 'var(--bg-root)', borderRadius: 8, padding: '10px 12px', border: CARD_BORDER }}>
                      <p style={{ ...T.overline, fontSize: 10 }}>{kpi.label}</p>
                      <p style={{ ...T.value, fontSize: 16, color, marginTop: 4 }}>{kpi.value}</p>
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

                <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: 'var(--bg-root)', borderRadius: 8, border: CARD_BORDER }}>
                  <p style={{ ...T.helper, fontSize: 11, lineHeight: 1.6 }}>
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
        <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 0' }}>
            <p style={T.overline}>Best Days by Channel</p>
            <p style={{ ...T.helper, fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              Top performing days to concentrate bids, based on historical day-of-week ROAS.
            </p>
            <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Channel', 'Best Day', 'Runner-up'].map(h => (
                  <th key={h} style={{
                    padding: '12px 24px', textAlign: h === 'Channel' ? 'left' : 'center',
                    ...T.overline, fontSize: 10,
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
        <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 0' }}>
            <p style={T.overline}>Seasonal Peaks by Channel</p>
            <p style={{ ...T.helper, fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              Which months each channel historically outperforms. Budget is weighted toward peak periods.
            </p>
            <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Channel', 'Peak Month', 'Implication'].map(h => (
                  <th key={h} style={{
                    padding: '12px 24px', textAlign: h === 'Channel' ? 'left' : h === 'Implication' ? 'left' : 'center',
                    ...T.overline, fontSize: 10,
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

      {/* ── METRIC DEFINITIONS ── */}
      <div>
        <button type="button" onClick={() => setMetricDefinitionsOpen(!metricDefinitionsOpen)} style={{
          fontFamily: 'Plus Jakarta Sans', fontSize: 12, fontWeight: 600,
          color: 'var(--text-muted)', background: 'var(--bg-card)', border: CARD_BORDER,
          borderRadius: 10, padding: '10px 14px', cursor: 'pointer', width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span><strong style={{ color: 'var(--text-secondary)' }}>Metric definitions</strong> — historical vs forecast vs uplift</span>
          {metricDefinitionsOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {metricDefinitionsOpen && (
          <div style={{ marginTop: 8, padding: '14px 16px', borderRadius: 10, border: CARD_BORDER, backgroundColor: 'var(--bg-card)', fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            <p style={{ margin: '0 0 10px 0' }}><strong>Historical mix</strong> — share of spend each channel earned in the loaded dataset (realized).</p>
            <p style={{ margin: '0 0 10px 0' }}><strong>Your mix</strong> — share implied by your allocation (paused channels excluded), normalized to 100%.</p>
            <p style={{ margin: '0 0 10px 0' }}><strong>AI recommended</strong> — optimizer output under the monthly budget and planning window.</p>
            <p style={{ margin: '0 0 10px 0' }}><strong>Current vs recommended revenue</strong> — both are <strong>model forecasts</strong> (α·ln(spend+1) × seasonality × DOW). When your mix matches AI, uplift is ~0 even if AI still differs from historical spend.</p>
            <p style={{ margin: '0 0 10px 0' }}><strong>AI vs historical</strong> — why AI diverges from historical budget share; a separate comparison from the uplift row.</p>
            <p style={{ margin: 0 }}><strong>Blended ROAS</strong> — forecast revenue ÷ budget for the selected period; not a simple average of daily channel ROAS from the API.</p>
          </div>
        )}
      </div>

      </>) /* end View 2 */}

      {/* FOOTER (shown in both views) */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: '16px 24px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Lightbulb size={15} style={{ color: '#FBBF24', marginTop: 1, flexShrink: 0 }} />
        <p style={{ ...T.helper, fontSize: 12, lineHeight: 1.6 }}>
          <span style={{ ...T.overline, fontSize: 10, marginRight: 4 }}>Methodology</span>
          Analyzes 3 years of daily data to identify diminishing returns. Recommends shifting budget toward channels projected to deliver the highest incremental revenue. Predictive estimates for planning only — not guaranteed outcomes.
        </p>
      </div>
    </div>
  );
}

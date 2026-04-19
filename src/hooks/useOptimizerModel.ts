import { useLayoutEffect, useMemo, useRef } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { useOptimizer, DEFAULT_MONTHLY_BUDGET } from '@/contexts/OptimizerContext';
import { CHANNELS } from '@/lib/mockData';
import type {
  OptimizerModelOutput,
  MixPlanSummary,
  ChannelForecastRow,
  ChannelDiagnosis,
  ChannelRecommendation,
  ChannelExplanation,
  UpliftSummary,
} from '@/lib/optimizerTypes';
import type { MonthPoint } from '@/lib/calculations';
import {
  computeChannelBaselines,
  computeCurrentMixForecast,
  computeRecommendedMix,
  computeTimingEffects,
  classifyChannelHealth,
  computeBudgetScenarios,
  type ChannelBaseline,
  type TimingEffects,
} from '@/lib/optimizer/calculations';

const TIMELINE_MONTHS: MonthPoint[] = (() => {
  const start = 2023;
  const end = 2027;
  return Array.from({ length: (end - start + 1) * 12 }, (_, i) => {
    const y = start + Math.floor(i / 12);
    const mo = i % 12;
    return { key: `${y}-${String(mo + 1).padStart(2, '0')}`, year: y, month: mo };
  });
})();

function buildMonthRange(
  period: '1m' | '1q' | '6m' | '1y' | 'custom',
  customStartMonth: string,
  customEndMonth: string,
): MonthPoint[] {
  if (period === 'custom') {
    const startIdx = TIMELINE_MONTHS.findIndex(m => m.key === customStartMonth);
    const endIdx = TIMELINE_MONTHS.findIndex(m => m.key === customEndMonth);
    if (startIdx < 0 || endIdx < 0) return [];
    return TIMELINE_MONTHS.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
  }
  const currentMonthKey = '2025-01';
  const startIdx = Math.max(0, TIMELINE_MONTHS.findIndex(m => m.key === currentMonthKey));
  const len = period === '1m' ? 1 : period === '1q' ? 3 : period === '6m' ? 6 : 12;
  return TIMELINE_MONTHS.slice(startIdx, startIdx + len);
}

function toPct(shares: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of CHANNELS) out[ch] = (shares[ch] || 0) * 100;
  return out;
}

function toShares(pct: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of CHANNELS) out[ch] = (pct[ch] || 0) / 100;
  return out;
}

function normalizeShares(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const ch of CHANNELS) {
    const v = Math.max(0, Number.isFinite(input[ch]) ? input[ch] : 0);
    out[ch] = v;
    total += v;
  }
  if (total <= 0) {
    const even = 1 / CHANNELS.length;
    for (const ch of CHANNELS) out[ch] = even;
    return out;
  }
  for (const ch of CHANNELS) out[ch] = out[ch] / total;
  return out;
}

function makePlanSummary(
  label: 'current' | 'optimized',
  forecast: ReturnType<typeof computeCurrentMixForecast>,
  allocationPct: Record<string, number>,
  durationMonths: number,
): MixPlanSummary {
  const channels: Record<string, ChannelForecastRow> = {};
  for (const ch of CHANNELS) {
    const c = forecast.channels[ch];
    channels[ch] = {
      channel: ch,
      allocationPct: c?.allocationPct ?? 0,
      spend: c?.forecastSpend ?? 0,
      periodSpend: (c?.forecastSpend ?? 0) * durationMonths,
      revenue: c?.forecastRevenue ?? 0,
      periodRevenue: (c?.forecastRevenue ?? 0) * durationMonths,
      roas: c?.forecastROAS ?? 0,
      marginalROAS: c?.marginalROAS ?? 0,
      seasonalityMultiplier: 1,
      dowMultiplier: 1,
      isCapped: (c?.forecastSpend ?? 0) >= (c?.saturationSpend ?? Infinity) * 0.7,
      capSpend: c?.saturationSpend ?? Infinity,
    };
  }
  return {
    label,
    allocationShares: toShares(allocationPct),
    channels,
    totalPeriodSpend: forecast.totalSpend * durationMonths,
    totalPeriodRevenue: forecast.totalRevenue * durationMonths,
    blendedROAS: forecast.blendedROAS,
  };
}

function diagnosisReason(status: ChannelDiagnosis['status']): string {
  if (status === 'saturated') return 'Marginal returns below breakeven';
  if (status === 'over-scaled') return 'Allocation appears above efficient range';
  if (status === 'under-scaled') return 'High efficiency, under-invested';
  return 'Efficient allocation';
}

function buildUpliftConfidence(
  upliftPct: number,
  avgConfidence: number,
): { tier: 'high' | 'moderate' | 'exploratory'; note: string } {
  if (avgConfidence >= 0.65 && upliftPct >= 1.5) {
    return {
      tier: 'high',
      note: 'Multiple channels show stable patterns and the projected uplift is meaningful.',
    };
  }
  if (avgConfidence >= 0.38 && upliftPct >= 0.3) {
    return {
      tier: 'moderate',
      note: 'The direction is supported by historical data, though exact uplift can vary.',
    };
  }
  return {
    tier: 'exploratory',
    note: 'Signal quality is limited, so treat this as directional guidance.',
  };
}

function effectiveAllocationShares(
  allocations: Record<string, number>,
  paused: Set<string>,
): Record<string, number> {
  const active = CHANNELS.filter(ch => !paused.has(ch));
  if (active.length === 0) return normalizeShares(allocations);
  const activeTotal = active.reduce((s, ch) => s + Math.max(0, allocations[ch] || 0), 0);
  const out: Record<string, number> = {};
  for (const ch of CHANNELS) {
    if (paused.has(ch)) out[ch] = 0;
    else out[ch] = activeTotal > 0 ? Math.max(0, allocations[ch] || 0) / activeTotal : 1 / active.length;
  }
  return normalizeShares(out);
}

function buildTimingWeights(timingEffects: TimingEffects, planningMonth: number | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const t = timingEffects.byChannel[ch];
    if (!t || planningMonth == null || planningMonth < 0 || planningMonth > 11 || t.monthlyStrength === 'weak') {
      out[ch] = 1;
      continue;
    }
    out[ch] = 0.8 + 0.2 * (t.monthlyIndex[planningMonth] ?? 1);
  }
  return out;
}

export function useOptimizerModel(): OptimizerModelOutput {
  const {
    aggregate,
    globalAggregate,
    isLoading,
    dataSource,
    dataUpdatedAt,
    auditReport,
    boundaries,
  } = useMarketingData({ includeGlobalAggregate: true });

  const {
    budget,
    planningPeriod,
    planningMode,
    customStartMonth,
    customEndMonth,
    allocations,
    setAllocations,
    paused,
  } = useOptimizer();

  const sourceData = globalAggregate ?? aggregate;
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_MONTHLY_BUDGET;
  const selectedRange = useMemo(
    () => buildMonthRange(planningPeriod, customStartMonth, customEndMonth),
    [planningPeriod, customStartMonth, customEndMonth],
  );
  const durationMonths = Math.max(1, selectedRange.length);
  const totalPeriodBudget = safeBudget * durationMonths;
  const planningMonth = planningPeriod === '1m' && selectedRange[0] ? selectedRange[0].month : null;

  const baselines = useMemo<ChannelBaseline[]>(
    () => (sourceData ? computeChannelBaselines(sourceData) : []),
    [sourceData],
  );
  const timingEffects = useMemo(
    () => (sourceData ? computeTimingEffects(sourceData) : { byChannel: {} }),
    [sourceData],
  );
  const tunedPeriodWeights = useMemo(
    () => buildTimingWeights(timingEffects, planningMonth),
    [timingEffects, planningMonth],
  );
  const rawPeriodWeights = useMemo(
    () => Object.fromEntries(CHANNELS.map(ch => [ch, 1])),
    [],
  );

  const historicalFractions = useMemo(() => {
    const out: Record<string, number> = {};
    if (baselines.length === 0) {
      const even = 1 / CHANNELS.length;
      CHANNELS.forEach(ch => {
        out[ch] = even;
      });
      return out;
    }
    for (const b of baselines) out[b.channel] = b.historicalAllocationPct / 100;
    return normalizeShares(out);
  }, [baselines]);

  /** Seed context allocations once from real historical spend shares (full dataset). User edits persist. */
  const didSeedHistoricalAllocations = useRef(false);
  useLayoutEffect(() => {
    if (baselines.length === 0) return;
    if (didSeedHistoricalAllocations.current) return;
    setAllocations({ ...historicalFractions });
    didSeedHistoricalAllocations.current = true;
  }, [baselines, historicalFractions, setAllocations]);

  const effectiveShares = useMemo(
    () => effectiveAllocationShares(allocations, paused),
    [allocations, paused],
  );
  const currentAllocationPct = useMemo(() => toPct(effectiveShares), [effectiveShares]);

  const currentForecast = useMemo(
    () => computeCurrentMixForecast(currentAllocationPct, safeBudget, baselines, { timingEffects, planningMonth }),
    [currentAllocationPct, safeBudget, baselines, timingEffects, planningMonth],
  );
  const recommended = useMemo(
    () => computeRecommendedMix(baselines, safeBudget, planningMode, currentAllocationPct, { timingEffects, planningMonth }),
    [baselines, safeBudget, planningMode, currentAllocationPct, timingEffects, planningMonth],
  );

  const currentPlan = useMemo(
    () => makePlanSummary('current', currentForecast, currentAllocationPct, durationMonths),
    [currentForecast, currentAllocationPct, durationMonths],
  );
  const optimizedPlan = useMemo(
    () => makePlanSummary('optimized', recommended.forecast, recommended.allocationsPct, durationMonths),
    [recommended, durationMonths],
  );

  const portfolioROASHistorical = useMemo(() => {
    const spend = baselines.reduce((s, b) => s + b.totalSpend, 0);
    const rev = baselines.reduce((s, b) => s + b.totalRevenue, 0);
    return spend > 0 ? rev / spend : 0;
  }, [baselines]);

  const diagnosis = useMemo((): Record<string, ChannelDiagnosis> => {
    const out: Record<string, ChannelDiagnosis> = {};
    for (const ch of CHANNELS) {
      const b = baselines.find(x => x.channel === ch);
      const cur = currentPlan.channels[ch];
      const histPct = (historicalFractions[ch] || 0) * 100;
      const curPct = cur?.allocationPct || 0;
      const deltaPct = curPct - histPct;
      const health = b
        ? classifyChannelHealth(b, safeBudget, curPct, portfolioROASHistorical)
        : {
            status: 'efficient' as const,
            lowerEfficientSpend: 0,
            upperEfficientSpend: 0,
            saturationSpend: Infinity,
            currentSpend: 0,
            marginalROAS: 0,
          };
      const reasonCode = diagnosisReason(health.status);
      const explanation =
        health.status === 'saturated'
          ? `${ch} is nearing saturation. Marginal ROAS is ${health.marginalROAS.toFixed(2)}x, so extra spend now produces weaker return.`
          : health.status === 'over-scaled'
            ? `${ch} is above its efficient spend band. Reallocating some budget can improve blended ROAS.`
            : health.status === 'under-scaled'
              ? `${ch} is under-invested versus its efficiency profile. It has headroom before saturation.`
              : `${ch} is within its efficient spend range.`;
      out[ch] = {
        channel: ch,
        status: health.status,
        isFlagged: health.status !== 'efficient',
        currentPct: curPct,
        historicalPct: histPct,
        deltaPct,
        historicalROAS: b?.historicalROAS ?? 0,
        portfolioROAS: portfolioROASHistorical,
        currentSpend: health.currentSpend,
        lowerEfficientSpend: health.lowerEfficientSpend,
        upperEfficientSpend: health.upperEfficientSpend,
        saturationSpend: health.saturationSpend,
        marginalROAS: health.marginalROAS,
        isSaturated: health.status === 'saturated',
        isOverWeighted: health.status === 'over-scaled',
        isUnderWeighted: health.status === 'under-scaled',
        reasonCode,
        explanation,
      };
    }
    return out;
  }, [baselines, currentPlan, historicalFractions, safeBudget, portfolioROASHistorical]);

  const recommendations = useMemo((): Record<string, ChannelRecommendation> => {
    const out: Record<string, ChannelRecommendation> = {};
    for (const ch of CHANNELS) {
      const currentPct = currentPlan.channels[ch]?.allocationPct || 0;
      const recommendedPct = recommended.allocationsPct[ch] || 0;
      const deltaPct = Number((recommendedPct - currentPct).toFixed(1));
      const direction: 'increase' | 'decrease' | 'hold' =
        deltaPct > 0.5 ? 'increase' : deltaPct < -0.5 ? 'decrease' : 'hold';
      const b = baselines.find(x => x.channel === ch);
      const reasonCodes: string[] = [];
      if ((currentPlan.channels[ch]?.marginalROAS || 0) < 1) reasonCodes.push('Marginal returns below breakeven');
      if ((currentPlan.channels[ch]?.marginalROAS || 0) > portfolioROASHistorical) reasonCodes.push('Above benchmark efficiency');
      if (timingEffects.byChannel[ch]?.monthlyStrength === 'strong') reasonCodes.push('Seasonal advantage');
      if (reasonCodes.length === 0) reasonCodes.push('Near-average efficiency');
      const explanation =
        direction === 'increase'
          ? `Increase from ${currentPct.toFixed(1)}% to ${recommendedPct.toFixed(1)}% based on higher marginal efficiency.`
          : direction === 'decrease'
            ? `Reduce from ${currentPct.toFixed(1)}% to ${recommendedPct.toFixed(1)}% because marginal return has weakened.`
            : `Hold near ${recommendedPct.toFixed(1)}% because this channel is already near its efficient zone.`;
      out[ch] = {
        channel: ch,
        currentPct,
        recommendedPct,
        deltaPct,
        direction,
        primaryReasonCode: reasonCodes[0],
        reasonCodes,
        explanation,
      };
      void b;
    }
    return out;
  }, [currentPlan, recommended, baselines, timingEffects, portfolioROASHistorical]);

  const flaggedChannels = useMemo(() => CHANNELS.filter(ch => diagnosis[ch]?.isFlagged), [diagnosis]);
  const overWeightedChannels = useMemo(() => CHANNELS.filter(ch => diagnosis[ch]?.isOverWeighted), [diagnosis]);
  const underWeightedChannels = useMemo(() => CHANNELS.filter(ch => diagnosis[ch]?.isUnderWeighted), [diagnosis]);

  const uplift = useMemo((): UpliftSummary => {
    const revenueOpportunity = optimizedPlan.totalPeriodRevenue - currentPlan.totalPeriodRevenue;
    const upliftPct = currentPlan.totalPeriodRevenue > 0 ? (revenueOpportunity / currentPlan.totalPeriodRevenue) * 100 : 0;
    const roasImprovement = optimizedPlan.blendedROAS - currentPlan.blendedROAS;
    const isNearOptimal = Math.abs(upliftPct) <= 0.35;
    const topIncreases = CHANNELS
      .filter(ch => recommendations[ch]?.direction === 'increase')
      .sort((a, b) => (recommendations[b]?.deltaPct || 0) - (recommendations[a]?.deltaPct || 0))
      .slice(0, 4)
      .map(ch => recommendations[ch]);
    const topReductions = CHANNELS
      .filter(ch => recommendations[ch]?.direction === 'decrease')
      .sort((a, b) => (recommendations[a]?.deltaPct || 0) - (recommendations[b]?.deltaPct || 0))
      .slice(0, 4)
      .map(ch => recommendations[ch]);
    const avgConfidence = mean(baselines.map(b => 1 / (1 + Math.max(0, b.monthlyROASCV))));
    return {
      revenueOpportunity,
      upliftPct,
      isNearOptimal,
      currentROAS: currentPlan.blendedROAS,
      recommendedROAS: optimizedPlan.blendedROAS,
      roasImprovement,
      topIncreases,
      topReductions,
      upliftConfidence: buildUpliftConfidence(upliftPct, avgConfidence),
    };
  }, [optimizedPlan, currentPlan, recommendations, baselines]);

  const explanation = useMemo((): Record<string, ChannelExplanation> => {
    const out: Record<string, ChannelExplanation> = {};
    for (const ch of CHANNELS) {
      const b = baselines.find(x => x.channel === ch);
      const t = timingEffects.byChannel[ch];
      const rec = recommendations[ch];
      const curRow = currentPlan.channels[ch];
      const recRow = optimizedPlan.channels[ch];
      const historicalROAS = b?.historicalROAS ?? 0;
      const rawROAS = historicalROAS;
      const tunedROAS = historicalROAS;
      const confidenceScore = b ? 1 / (1 + Math.max(0, b.monthlyROASCV)) : 0.5;
      const volatilityScore = b ? Math.max(0, b.monthlyROASCV) : 0.5;
      const stabilityScore = Math.max(0, 1 - Math.min(1, volatilityScore));
      out[ch] = {
        channel: ch,
        rawROAS,
        tunedROAS,
        historicalROAS: tunedROAS,
        portfolioROAS: portfolioROASHistorical,
        efficiencyConfidence: confidenceScore,
        stabilityScore,
        volatilityScore,
        isHighVolatility: volatilityScore > 0.5,
        saturationCurve: (b?.monthlyPoints || []).map(p => ({ spend: p.spend, roas: p.roas })),
        capSpend: curRow?.capSpend ?? Infinity,
        capReason: Number.isFinite(curRow?.capSpend || Infinity)
          ? `${ch} enters saturation near ${Math.round((curRow?.capSpend || 0) / 100000)}L monthly spend.`
          : `${ch} does not show a clear saturation cap in observed history.`,
        isSaturated: diagnosis[ch]?.isSaturated ?? false,
        marginalROASAtCurrent: curRow?.marginalROAS || 0,
        marginalROASAtRecommended: recRow?.marginalROAS || 0,
        peakMonth: t?.peakMonth ?? 0,
        peakBoost: t?.peakBoost ?? 0,
        seasonalityIndex: t?.monthlyIndex ?? Array(12).fill(1),
        rawSeasonalityIndex: t?.monthlyIndex ?? Array(12).fill(1),
        seasonalityStrength: t?.monthlyStrength ?? 'weak',
        bestDay: t?.bestDay ?? 0,
        worstDay: t?.worstDay ?? 0,
        dowIndex: t?.dowIndex ?? Array(7).fill(1),
        rawDowIndex: t?.dowIndex ?? Array(7).fill(1),
        weekendBias: t?.weekendBias ?? 'neutral',
        dowEffectStrength: t?.dowStrength ?? 'weak',
        reasonCodes: rec?.reasonCodes || [],
      };
    }
    return out;
  }, [baselines, timingEffects, recommendations, currentPlan, optimizedPlan, portfolioROASHistorical, diagnosis]);

  const totalHistoricalMonths = useMemo(() => {
    const active = baselines.flatMap(b => b.monthlyPoints.map(p => p.monthKey));
    const unique = new Set(active);
    return unique.size || 1;
  }, [baselines]);

  const dataRange = useMemo(() => {
    if (!boundaries) return null;
    return { min: boundaries.earliestDate, max: boundaries.latestDate };
  }, [boundaries]);

  const scenarioBudgets = useMemo(() => [3500000, 4250000, 5000000, 6000000, 7500000], []);
  const scenarioOutputs = useMemo(
    () => computeBudgetScenarios(baselines, scenarioBudgets, planningMode, currentAllocationPct, { timingEffects, planningMonth }),
    [baselines, scenarioBudgets, planningMode, currentAllocationPct, timingEffects, planningMonth],
  );

  const portfolioAvgConfidence = useMemo(
    () => mean(baselines.map(b => 1 / (1 + Math.max(0, b.monthlyROASCV)))) || 0.5,
    [baselines],
  );

  return {
    isLoading,
    dataSource: dataSource || 'mock',
    dataUpdatedAt,
    dataRange,
    totalHistoricalMonths,
    selectedRange,
    durationMonths,
    monthlyBudget: safeBudget,
    totalPeriodBudget,
    modeMultiplier: 1,
    historicalFractions,
    portfolioROAS: portfolioROASHistorical,
    currentPlan,
    optimizedPlan,
    diagnosis,
    flaggedChannels,
    overWeightedChannels,
    underWeightedChannels,
    uplift,
    recommendations,
    explanation,
    debug: {
      calibration: {
        channelProfiles: {},
        seasonalityProfiles: {},
        dowProfiles: {},
        tunedModels: [],
        portfolioMedianROAS: portfolioROASHistorical,
        portfolioAvgConfidence,
      } as any,
      tunedPeriodWeights,
      rawPeriodWeights,
      portfolioAvgConfidence,
      baselines: baselines.map(b => ({
        channel: b.channel,
        totalSpend: b.totalSpend,
        totalRevenue: b.totalRevenue,
        historicalROAS: b.historicalROAS,
        historicalAllocationPct: b.historicalAllocationPct / 100,
        avgMonthlySpend: b.avgMonthlySpend,
        avgMonthlyRevenue: b.avgMonthlyRevenue,
        spendVolatility: b.monthlyROASCV,
        revenueVolatility: b.monthlyROASCV,
        activeMonthCount: b.activeMonths,
      })) as any,
      auditReport: auditReport ?? null,
      scenarios: scenarioOutputs,
    } as any,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

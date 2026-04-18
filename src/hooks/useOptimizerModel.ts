/**
 * useOptimizerModel.ts
 *
 * Single calculation backbone for all Mix Optimiser pages.
 *
 * Data flow (strictly ordered):
 *   1. Input state (from OptimizerContext)
 *   2. Historical model inputs — raw (summaries, models, seasonality, dow, caps)
 *   3. Calibration pass — raw signals → tuned signals (winsorized ROAS, smoothed timing,
 *      confidence-adjusted alphas, inertia-stabilized allocation)
 *   4. Effective allocation (current manual, paused channels zeroed out)
 *   5. Tuned optimal allocation (from optimizer using tuned models + tuned period weights,
 *      then stabilized with inertia relative to historical)
 *   6. Current plan forecast (buildMonthlyPlanFromData with effective alloc + tuned models)
 *   7. Optimized plan forecast (same engine, stabilized optimal alloc + tuned models)
 *   8. Diagnosis (derived from current plan vs historical — does NOT read optimizedPlan)
 *   9. Recommendations (current vs optimized delta + reason codes)
 *  10. Uplift (computed ONLY from step 6 vs step 7, with confidence tier)
 *  11. Explanation layer (tuned + raw signals for Why It Works)
 *  12. Scenario outputs (same tuned model at multiple budget levels)
 *
 * Raw → Tuned distinction:
 *   All computations that affect recommended allocation or forecast revenue use
 *   TUNED values (confidence-adjusted alpha, smoothed timing weights).
 *   Raw values are preserved in the debug output and explanation layer for audit.
 */

import { useMemo, useEffect } from 'react';
import { useMarketingData } from '@/hooks/useMarketingData';
import { useOptimizer } from '@/contexts/OptimizerContext';
import {
  getChannelSummaries,
  getChannelSaturationModels,
  getSeasonalityMetrics,
  getDayOfWeekMetrics,
  getChannelCapsFromData,
  getPortfolioWeightedROAS,
  buildMonthRange,
  getPeriodTimeWeightSums,
  buildMonthlyPlanFromData,
  getOptimalSharesForPeriod,
  classifyMixChannelEfficiency,
  computeRevenueUpliftMetrics,
  getPeriodicMarginalROAS,
  getTimeFrameMonths,
  type MonthPoint,
  type SaturationModel,
  type ChannelCapMetrics,
} from '@/lib/calculations';
import {
  calibrate,
  computeTunedPeriodWeights,
  computeTunedOptimalShares,
  stabilizeRecommendedAllocation,
  classifyUpliftConfidence,
} from '@/lib/optimizerCalibration';
import { CHANNELS } from '@/lib/mockData';
import { formatINRCompact } from '@/lib/formatCurrency';
import type {
  OptimizerModelOutput,
  MixPlanSummary,
  ChannelForecastRow,
  ChannelDiagnosis,
  ChannelRecommendation,
  ChannelExplanation,
  UpliftSummary,
  ScenarioOutput,
  MarginalNote,
} from '@/lib/optimizerTypes';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMELINE_MONTHS: MonthPoint[] = (() => {
  const start = 2023, end = 2027;
  return Array.from({ length: (end - start + 1) * 12 }, (_, i) => {
    const y = start + Math.floor(i / 12), mo = i % 12;
    return { key: `${y}-${String(mo + 1).padStart(2, '0')}`, year: y, month: mo };
  });
})();

const SCENARIO_TIERS = [
  { key: 'conservative', label: 'Conservative', monthlyMultiplier: 0.60 },
  { key: 'current',      label: 'Current',       monthlyMultiplier: 1.00 },
  { key: 'growth',       label: 'Growth',         monthlyMultiplier: 1.30 },
  { key: 'aggressive',   label: 'Aggressive',     monthlyMultiplier: 1.50 },
];

// ── Reason code builder ───────────────────────────────────────────────────────
// Now uses tunedROAS (winsorized, spend-weighted) rather than raw historical ROAS.
// This prevents one-off spike months from distorting channel rankings.

function buildReasonCodes(p: {
  tunedROAS: number;
  portfolioMedianROAS: number;
  marginalROAS: number;
  currentPct: number;
  historicalPct: number;
  recommendedPct: number;
  peakBoost: number;
  weekendBias: string;
  isCapped: boolean;
  capSpend: number;
  monthlySpend: number;
  efficiencyConfidence: number;
  isHighVolatility: boolean;
}): string[] {
  const codes: string[] = [];

  // Efficiency relative to portfolio median (tuned ROAS vs portfolio median tuned ROAS)
  if (p.tunedROAS > p.portfolioMedianROAS * 1.25)      codes.push('Above benchmark efficiency');
  else if (p.tunedROAS < p.portfolioMedianROAS * 0.75)  codes.push('Below benchmark efficiency');
  else                                                   codes.push('Near-average efficiency');

  // Marginal return signal
  if (p.marginalROAS < 1.0)                              codes.push('Marginal returns below breakeven');
  else if (p.marginalROAS < p.tunedROAS * 0.60)          codes.push('Marginal returns weakening');
  else                                                   codes.push('Healthy marginal return');

  // Saturation pressure
  if (p.isCapped || (Number.isFinite(p.capSpend) && p.monthlySpend > p.capSpend * 0.85))
    codes.push('Allocation near saturation cap');

  // Allocation vs historical benchmark (5pp threshold)
  if (p.currentPct < p.historicalPct - 5)         codes.push('Below benchmark allocation');
  else if (p.currentPct > p.historicalPct + 5)    codes.push('Above benchmark allocation');

  // Optimizer direction signal (after stabilization)
  if (p.recommendedPct > p.currentPct + 2.5)      codes.push('Optimizer suggests increase');
  else if (p.recommendedPct < p.currentPct - 2.5) codes.push('Optimizer suggests reduction');

  // Timing advantages
  if (p.peakBoost > 0.15) codes.push('Seasonal advantage');
  if (p.weekendBias !== 'neutral') codes.push(`Strong ${p.weekendBias} performance`);

  // Data quality warning (shown in explanation layer, not diagnosis)
  if (p.isHighVolatility) codes.push('Performance signal is volatile');
  else if (p.efficiencyConfidence > 0.70) codes.push('Consistent strong return profile');

  return codes;
}

// ── Effective allocation (handles paused channels) ────────────────────────────

function computeEffectiveAlloc(
  allocations: Record<string, number>,
  paused: Set<string>,
): Record<string, number> {
  const active = CHANNELS.filter(ch => !paused.has(ch));
  const activeTotal = active.reduce((s, ch) => s + (allocations[ch] || 0), 0);
  const eff: Record<string, number> = {};
  for (const ch of CHANNELS) {
    if (paused.has(ch)) { eff[ch] = 0; continue; }
    eff[ch] = activeTotal > 0 ? (allocations[ch] || 0) / activeTotal : 1 / active.length;
  }
  const sum = Object.values(eff).reduce((s, v) => s + v, 0);
  if (sum > 0) for (const k of Object.keys(eff)) eff[k] /= sum;
  return eff;
}

// ── Plan summary builder ──────────────────────────────────────────────────────

function buildPlanSummary(
  label: 'current' | 'optimized',
  allocationShares: Record<string, number>,
  planResult: ReturnType<typeof buildMonthlyPlanFromData>,
  tunedModels: SaturationModel[],
  tunedPeriodWeights: Record<string, number>,
  durationMonths: number,
): MixPlanSummary {
  const denom = Math.max(1, durationMonths);
  const channels: Record<string, ChannelForecastRow> = {};

  for (const ch of CHANNELS) {
    const totals       = planResult.channelTotals[ch] || { spend: 0, revenue: 0 };
    const model        = tunedModels.find(m => m.channel === ch);
    const monthlySpend = totals.spend / denom;
    const pw           = tunedPeriodWeights[ch] ?? 1;
    const marginalROAS = model ? getPeriodicMarginalROAS(model, monthlySpend, pw) : 0;
    const roas         = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    const cell         = planResult.rows[0]?.cells[ch];

    channels[ch] = {
      channel: ch,
      allocationPct:         Math.round((allocationShares[ch] || 0) * 1000) / 10,
      spend:                 monthlySpend,
      periodSpend:           totals.spend,
      revenue:               totals.revenue / denom,
      periodRevenue:         totals.revenue,
      roas,
      marginalROAS,
      seasonalityMultiplier: cell?.seasonalityMultiplier ?? 1,
      dowMultiplier:         cell?.dayOfWeekMultiplier   ?? 1,
      isCapped:              cell?.capped                ?? false,
      capSpend:              cell?.capSpend              ?? Infinity,
    };
  }

  return {
    label,
    allocationShares,
    channels,
    totalPeriodSpend:   planResult.totalSpend,
    totalPeriodRevenue: planResult.totalRevenue,
    blendedROAS: planResult.totalSpend > 0
      ? planResult.totalRevenue / planResult.totalSpend
      : 0,
  };
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useOptimizerModel(): OptimizerModelOutput {
  const {
    data, aggregate, globalAggregate, isLoading,
    dataSource, dataUpdatedAt,
  } = useMarketingData({ includeGlobalAggregate: true });

  const {
    budget, setBudget,
    planningPeriod, planningMode,
    customStartMonth, customEndMonth,
    allocations, setAllocations,
    paused,
    hasSetInitialBudget, setHasSetInitialBudget,
  } = useOptimizer();

  const sourceData = globalAggregate || aggregate || data;

  // ── Step 2: Raw historical model inputs ──────────────────────────────────────
  const summaries = useMemo(
    () => sourceData ? getChannelSummaries(sourceData) : [],
    [sourceData],
  );

  const rawModels = useMemo(
    () => sourceData ? getChannelSaturationModels(sourceData) : [],
    [sourceData],
  );

  const rawSeasonality = useMemo(
    () => sourceData ? getSeasonalityMetrics(sourceData) : [],
    [sourceData],
  );

  const rawDowMetrics = useMemo(
    () => sourceData ? getDayOfWeekMetrics(sourceData) : [],
    [sourceData],
  );

  const caps = useMemo(
    () => getChannelCapsFromData(sourceData || []),
    [sourceData],
  );

  const portfolioROAS = useMemo(
    () => getPortfolioWeightedROAS(summaries),
    [summaries],
  );

  const totalHistoricalMonths = useMemo(
    () => sourceData ? getTimeFrameMonths(sourceData) : 1,
    [sourceData],
  );

  const historicalFractions = useMemo(() => {
    const total = summaries.reduce((s, c) => s + c.totalSpend, 0);
    const f: Record<string, number> = {};
    CHANNELS.forEach(ch => {
      const s = summaries.find(x => x.channel === ch);
      f[ch] = total > 0 ? (s?.totalSpend || 0) / total : 1 / CHANNELS.length;
    });
    return f;
  }, [summaries]);

  const avgMonthlySpend = useMemo(
    () => summaries.length === 0
      ? 5_000_000
      : Math.round(summaries.reduce((s, c) => s + c.totalSpend, 0) / Math.max(1, totalHistoricalMonths)),
    [summaries, totalHistoricalMonths],
  );

  // ── Step 1 side-effects: seed budget + allocations from history ────────────
  useEffect(() => {
    if (hasSetInitialBudget || summaries.length === 0) return;
    setBudget(Math.round(avgMonthlySpend / 1000) * 1000);
    setHasSetInitialBudget(true);
  }, [avgMonthlySpend, hasSetInitialBudget, summaries.length, setBudget, setHasSetInitialBudget]);

  useEffect(() => {
    if (Object.keys(allocations).length > 0) return;
    setAllocations({ ...historicalFractions });
  }, [historicalFractions, allocations, setAllocations]);

  // ── Step 3: Calibration pass ─────────────────────────────────────────────────
  // Produces tuned models, smoothed timing profiles, and confidence scores.
  // This memo is STABLE — only re-runs when sourceData changes.
  const calibration = useMemo(
    () => {
      if (!sourceData || rawModels.length === 0) return null;
      return calibrate(sourceData, rawModels, rawSeasonality, rawDowMetrics);
    },
    [sourceData, rawModels, rawSeasonality, rawDowMetrics],
  );

  // Safe accessors for calibration outputs (fall back to raw if not available)
  const tunedModels       = calibration?.tunedModels       ?? rawModels;
  const channelProfiles   = calibration?.channelProfiles   ?? {};
  const seasonalProfiles  = calibration?.seasonalityProfiles ?? {};
  const dowProfiles       = calibration?.dowProfiles       ?? {};
  const portfolioMedianROAS = calibration?.portfolioMedianROAS ?? portfolioROAS;
  const portfolioAvgConfidence = calibration?.portfolioAvgConfidence ?? 0.5;

  // ── Planning range ────────────────────────────────────────────────────────

  const safeBudget = useMemo(
    () => Number.isFinite(budget) && budget > 0 ? budget : 5_000_000,
    [budget],
  );

  const modeMultiplier =
    planningMode === 'conservative' ? 0.8 :
    planningMode === 'aggressive'   ? 1.2 : 1.0;

  const selectedRange = useMemo(
    () => buildMonthRange(TIMELINE_MONTHS, '2025-01', planningPeriod, customStartMonth, customEndMonth),
    [planningPeriod, customStartMonth, customEndMonth],
  );

  const durationMonths    = Math.max(1, selectedRange.length);
  const totalPeriodBudget = safeBudget * durationMonths;

  // Raw period weights (from unsmoothed seasonality + dow — kept for debug/comparison)
  const rawPeriodWeights = useMemo(
    () => sourceData ? getPeriodTimeWeightSums(sourceData, selectedRange) : {},
    [sourceData, selectedRange],
  );

  // Tuned period weights (from smoothed + shrunk seasonality + dow indices)
  // Used by optimizer and marginal ROAS computation — replaces raw period weights.
  const tunedPeriodWeights = useMemo(
    () => Object.keys(seasonalProfiles).length > 0
      ? computeTunedPeriodWeights(seasonalProfiles, dowProfiles, selectedRange)
      : rawPeriodWeights,
    [seasonalProfiles, dowProfiles, selectedRange, rawPeriodWeights],
  );

  // ── Step 4: Effective allocation ──────────────────────────────────────────
  const effectiveAlloc = useMemo(
    () => computeEffectiveAlloc(allocations, paused),
    [allocations, paused],
  );

  // ── Step 5: Tuned optimal allocation ──────────────────────────────────────
  // Uses tuned models (confidence-adjusted alpha) + tuned period weights (smoothed timing).
  // Then applies inertia stabilization to prevent aggressive reallocation from weak signals.
  const rawTunedOptimalShares = useMemo(
    () => {
      if (tunedModels.length === 0 || Object.keys(tunedPeriodWeights).length === 0) {
        return getOptimalSharesForPeriod({ data: sourceData || [], selectedMonths: selectedRange, monthlyBudget: safeBudget });
      }
      return computeTunedOptimalShares(tunedModels, safeBudget, tunedPeriodWeights, channelProfiles);
    },
    [tunedModels, safeBudget, tunedPeriodWeights, channelProfiles, sourceData, selectedRange],
  );

  // Apply inertia — blends optimal toward historical to prevent over-reactive recommendations
  const stabilizedOptimalShares = useMemo(
    () => Object.keys(channelProfiles).length > 0
      ? stabilizeRecommendedAllocation(rawTunedOptimalShares, historicalFractions, channelProfiles)
      : rawTunedOptimalShares,
    [rawTunedOptimalShares, historicalFractions, channelProfiles],
  );

  // ── Step 6: Current plan forecast ─────────────────────────────────────────
  // Uses tuned saturation models so revenue is forecast with calibrated alphas.
  const currentPlanResult = useMemo(
    () => buildMonthlyPlanFromData({
      data:             sourceData || [],
      selectedMonths:   selectedRange,
      monthlyBudget:    safeBudget,
      modeMultiplier,
      allocationShares: effectiveAlloc,
      saturationModels: tunedModels,
    }),
    [sourceData, selectedRange, safeBudget, modeMultiplier, effectiveAlloc, tunedModels],
  );

  // ── Step 7: Optimized plan forecast ───────────────────────────────────────
  // Same tuned models as Step 6 — ONLY allocation shares differ.
  const optimizedPlanResult = useMemo(
    () => buildMonthlyPlanFromData({
      data:             sourceData || [],
      selectedMonths:   selectedRange,
      monthlyBudget:    safeBudget,
      modeMultiplier,
      allocationShares: stabilizedOptimalShares,
      saturationModels: tunedModels,
    }),
    [sourceData, selectedRange, safeBudget, modeMultiplier, stabilizedOptimalShares, tunedModels],
  );

  const currentPlan = useMemo(
    () => buildPlanSummary('current', effectiveAlloc, currentPlanResult, tunedModels, tunedPeriodWeights, durationMonths),
    [effectiveAlloc, currentPlanResult, tunedModels, tunedPeriodWeights, durationMonths],
  );

  const optimizedPlan = useMemo(
    () => buildPlanSummary('optimized', stabilizedOptimalShares, optimizedPlanResult, tunedModels, tunedPeriodWeights, durationMonths),
    [stabilizedOptimalShares, optimizedPlanResult, tunedModels, tunedPeriodWeights, durationMonths],
  );

  // ── Step 8: Diagnosis ─────────────────────────────────────────────────────
  // Uses tunedROAS (not raw ROAS) for channel comparisons so outlier-heavy channels
  // are not over- or under-classified.
  const diagnosis = useMemo((): Record<string, ChannelDiagnosis> => {
    const capMap: Record<string, ChannelCapMetrics> = {};
    caps.forEach(c => (capMap[c.channel] = c));
    const result: Record<string, ChannelDiagnosis> = {};

    for (const ch of CHANNELS) {
      const s          = summaries.find(x => x.channel === ch);
      const m          = tunedModels.find(x => x.channel === ch);
      const profile    = channelProfiles[ch];
      const curRow     = currentPlan.channels[ch];
      const histPct    = (historicalFractions[ch] || 0) * 100;
      const curPct     = curRow?.allocationPct || 0;
      const deltaPct   = curPct - histPct;
      // Use tunedROAS for comparison — more stable than raw historical ROAS
      const channelROAS = profile?.tunedROAS ?? s?.roas ?? 0;
      const marg        = curRow?.marginalROAS || 0;
      const cap         = capMap[ch];

      const status = (s && m) ? classifyMixChannelEfficiency({
        optimalFraction:     stabilizedOptimalShares[ch] || 0,
        manualFraction:      effectiveAlloc[ch]          || 0,
        model:               m,
        cap,
        // Use portfolioMedianROAS (from tuned data) instead of raw portfolio average
        portfolioAvgROAS:    portfolioMedianROAS,
        monthlyBudget:       safeBudget,
        summaryROAS:         channelROAS,
        periodTimeWeightSum: tunedPeriodWeights[ch] ?? 1,
      }) : 'efficient';

      const isSaturated     = status === 'saturated';
      const isOverWeighted  = deltaPct > 5;
      const isUnderWeighted = deltaPct < -5;
      // Only flag a channel if: status is not efficient AND we have reasonable confidence
      // Low-confidence channels get a softer flag to avoid over-labeling noise
      const isFlagged = status !== 'efficient' && (profile?.efficiencyConfidence ?? 0.5) > 0.20;

      let reasonCode = 'Efficient allocation';
      if (isSaturated)                   reasonCode = 'Marginal returns below breakeven';
      else if (status === 'over-scaled') reasonCode = isOverWeighted
        ? 'Allocation appears above efficient range'
        : 'Receiving more than efficiency justifies';
      else if (status === 'under-scaled') reasonCode = 'High efficiency, under-invested';

      let explanation = `${ch} is receiving ${curPct.toFixed(0)}% of budget (historical: ${histPct.toFixed(0)}%) with a ${channelROAS.toFixed(2)}x return profile — near the portfolio median of ${portfolioMedianROAS.toFixed(2)}x.`;
      if (isSaturated) {
        explanation = `${ch} shows diminishing returns. Marginal ROAS at current spend is ${marg.toFixed(2)}x — each additional rupee returns less than ₹1. Reducing spend here and reallocating to under-invested channels can improve portfolio return.`;
      } else if (status === 'over-scaled') {
        explanation = `${ch} is receiving ${curPct.toFixed(0)}% but its return profile (${channelROAS.toFixed(2)}x) doesn't fully justify this relative to the portfolio median (${portfolioMedianROAS.toFixed(2)}x). The model would reduce this allocation.`;
      } else if (status === 'under-scaled') {
        explanation = `${ch} has a strong ${channelROAS.toFixed(2)}x return profile but is receiving only ${curPct.toFixed(0)}% of budget. There may be room to scale before hitting diminishing returns.`;
      }

      result[ch] = {
        channel: ch, status, isFlagged,
        currentPct: curPct, historicalPct: histPct, deltaPct,
        historicalROAS: channelROAS, portfolioROAS: portfolioMedianROAS, marginalROAS: marg,
        isSaturated, isOverWeighted, isUnderWeighted,
        reasonCode, explanation,
      };
    }
    return result;
  }, [summaries, tunedModels, caps, currentPlan, historicalFractions, effectiveAlloc,
      stabilizedOptimalShares, portfolioMedianROAS, safeBudget, tunedPeriodWeights,
      channelProfiles]);

  const flaggedChannels      = useMemo(() => CHANNELS.filter(ch => diagnosis[ch]?.isFlagged),       [diagnosis]);
  const overWeightedChannels  = useMemo(() => CHANNELS.filter(ch => diagnosis[ch]?.isOverWeighted),  [diagnosis]);
  const underWeightedChannels = useMemo(() => CHANNELS.filter(ch => diagnosis[ch]?.isUnderWeighted), [diagnosis]);

  // ── Step 9: Recommendations ───────────────────────────────────────────────
  const recommendations = useMemo((): Record<string, ChannelRecommendation> => {
    const capMap: Record<string, ChannelCapMetrics> = {};
    caps.forEach(c => (capMap[c.channel] = c));
    const result: Record<string, ChannelRecommendation> = {};

    for (const ch of CHANNELS) {
      const curPct   = currentPlan.channels[ch]?.allocationPct || 0;
      const recPct   = Math.round((stabilizedOptimalShares[ch] || 0) * 1000) / 10;
      const deltaPct = Math.round((recPct - curPct) * 10) / 10;
      // Wider "hold" band (2.5pp vs 1.5pp) since stabilization already dampens noise
      const direction: 'increase' | 'decrease' | 'hold' =
        deltaPct > 2.5 ? 'increase' : deltaPct < -2.5 ? 'decrease' : 'hold';

      const profile      = channelProfiles[ch];
      const tunedROAS    = profile?.tunedROAS ?? summaries.find(s => s.channel === ch)?.roas ?? 0;
      const marg         = currentPlan.channels[ch]?.marginalROAS || 0;
      const histPct      = (historicalFractions[ch] || 0) * 100;
      const sea          = seasonalProfiles[ch];
      const dow          = dowProfiles[ch];
      const cap          = capMap[ch];
      const monthlySpend = currentPlan.channels[ch]?.spend || 0;

      const reasonCodes = buildReasonCodes({
        tunedROAS,
        portfolioMedianROAS,
        marginalROAS:         marg,
        currentPct:           curPct,
        historicalPct:        histPct,
        recommendedPct:       recPct,
        peakBoost:            sea?.peakBoost || 0,
        weekendBias:          dow?.weekendBias || 'neutral',
        isCapped:             currentPlan.channels[ch]?.isCapped || false,
        capSpend:             cap?.capSpend ?? Infinity,
        monthlySpend,
        efficiencyConfidence: profile?.efficiencyConfidence ?? 0.5,
        isHighVolatility:     profile?.isHighVolatility ?? false,
      });

      let explanation = `Hold at ${recPct.toFixed(1)}% — ${(reasonCodes[0] || 'near-average efficiency').toLowerCase()}.`;
      if (direction === 'increase') {
        const positives = reasonCodes.filter(c =>
          c.includes('efficiency') || c.includes('advantage') || c.includes('Healthy') || c.includes('Consistent'));
        explanation = `Increase from ${curPct.toFixed(1)}% → ${recPct.toFixed(1)}%. ${positives.join('; ') || 'Positive marginal return still available at higher spend'}.`;
      } else if (direction === 'decrease') {
        const negatives = reasonCodes.filter(c =>
          c.includes('weakening') || c.includes('saturati') || c.includes('Below') || c.includes('breakeven'));
        explanation = `Reduce from ${curPct.toFixed(1)}% → ${recPct.toFixed(1)}%. ${negatives.join('; ') || 'Efficiency concerns at current spend level'}.`;
      }

      result[ch] = {
        channel: ch, currentPct: curPct, recommendedPct: recPct, deltaPct, direction,
        primaryReasonCode: reasonCodes[0] || '', reasonCodes, explanation,
      };
    }
    return result;
  }, [currentPlan, stabilizedOptimalShares, summaries, channelProfiles, historicalFractions,
      seasonalProfiles, dowProfiles, caps, portfolioMedianROAS]);

  // ── Step 10: Uplift ───────────────────────────────────────────────────────
  // Both plans use the SAME tuned forecast engine — only allocation differs.
  // Uplift confidence tier reflects data quality, not just magnitude.
  const uplift = useMemo((): UpliftSummary => {
    const { revenueOpportunity, upliftPct, isNearOptimal } = computeRevenueUpliftMetrics(
      currentPlan.totalPeriodRevenue,
      optimizedPlan.totalPeriodRevenue,
    );
    const roasImprovement = optimizedPlan.blendedROAS - currentPlan.blendedROAS;

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

    // Combine top movers for confidence assessment
    const allTop = [...topIncreases, ...topReductions].filter(Boolean);
    const upliftConfidence = classifyUpliftConfidence(
      isNearOptimal ? 0 : upliftPct,
      portfolioAvgConfidence,
      allTop,
    );

    return {
      revenueOpportunity, upliftPct, isNearOptimal,
      currentROAS: currentPlan.blendedROAS,
      recommendedROAS: optimizedPlan.blendedROAS,
      roasImprovement, topIncreases, topReductions,
      upliftConfidence,
    };
  }, [currentPlan, optimizedPlan, recommendations, portfolioAvgConfidence]);

  // ── Step 11: Explanation layer ────────────────────────────────────────────
  // Exposes both raw and tuned signals so Why It Works can show the delta.
  const explanation = useMemo((): Record<string, ChannelExplanation> => {
    const capMap: Record<string, ChannelCapMetrics> = {};
    caps.forEach(c => (capMap[c.channel] = c));
    const result: Record<string, ChannelExplanation> = {};

    for (const ch of CHANNELS) {
      const tunedModel  = tunedModels.find(m => m.channel === ch);
      const rawModel    = rawModels.find(m => m.channel === ch);
      const sea         = seasonalProfiles[ch];
      const dow         = dowProfiles[ch];
      const cap         = capMap[ch];
      const profile     = channelProfiles[ch];
      const curSpend    = currentPlan.channels[ch]?.spend || 0;
      const recSpend    = optimizedPlan.channels[ch]?.spend || 0;
      const pw          = tunedPeriodWeights[ch] ?? 1;
      const rawROAS     = summaries.find(s => s.channel === ch)?.roas ?? 0;
      const tunedROAS   = profile?.tunedROAS ?? rawROAS;
      const histPct     = (historicalFractions[ch] || 0) * 100;
      const curPct      = currentPlan.channels[ch]?.allocationPct || 0;
      const recPct      = Math.round((stabilizedOptimalShares[ch] || 0) * 1000) / 10;
      const margAtCur   = tunedModel ? getPeriodicMarginalROAS(tunedModel, curSpend, pw) : 0;
      const margAtRec   = tunedModel ? getPeriodicMarginalROAS(tunedModel, recSpend, pw) : 0;

      const reasonCodes = buildReasonCodes({
        tunedROAS, portfolioMedianROAS, marginalROAS: margAtCur,
        currentPct: curPct, historicalPct: histPct, recommendedPct: recPct,
        peakBoost: sea?.peakBoost || 0, weekendBias: dow?.weekendBias || 'neutral',
        isCapped: currentPlan.channels[ch]?.isCapped || false,
        capSpend: cap?.capSpend ?? Infinity, monthlySpend: curSpend,
        efficiencyConfidence: profile?.efficiencyConfidence ?? 0.5,
        isHighVolatility: profile?.isHighVolatility ?? false,
      });

      // Use tuned scatter points from tuned model if available,
      // fall back to raw model scatter for visual display
      const saturationCurve = (tunedModel ?? rawModel)?.scatterPoints?.map(p => ({ spend: p.spend, roas: p.roas })) || [];

      result[ch] = {
        channel: ch,
        rawROAS, tunedROAS,
        historicalROAS: tunedROAS, // pages use historicalROAS — alias to tuned for consistency
        portfolioROAS: portfolioMedianROAS,
        efficiencyConfidence: profile?.efficiencyConfidence ?? 0.5,
        stabilityScore:       profile?.stabilityScore       ?? 0.5,
        volatilityScore:      profile?.volatilityScore      ?? 0.5,
        isHighVolatility:     profile?.isHighVolatility     ?? false,
        saturationCurve,
        capSpend:   cap?.capSpend  ?? Infinity,
        capReason:  cap?.capReason ?? '',
        isSaturated: diagnosis[ch]?.isSaturated || false,
        marginalROASAtCurrent:     margAtCur,
        marginalROASAtRecommended: margAtRec,
        // Tuned timing
        peakMonth:           sea?.peakMonth       ?? 0,
        peakBoost:           sea?.peakBoost       ?? 0,
        seasonalityIndex:    sea?.tunedMonthlyIndex ?? Array(12).fill(1),
        rawSeasonalityIndex: sea?.rawMonthlyIndex   ?? Array(12).fill(1),
        seasonalityStrength: sea?.seasonalityStrength ?? 'weak',
        bestDay:      dow?.bestDay     ?? 0,
        worstDay:     dow?.worstDay    ?? 0,
        dowIndex:     dow?.tunedDowIndex ?? Array(7).fill(1),
        rawDowIndex:  dow?.rawDowIndex   ?? Array(7).fill(1),
        weekendBias:      dow?.weekendBias      ?? 'neutral',
        dowEffectStrength: dow?.effectStrength   ?? 'weak',
        reasonCodes,
      };
    }
    return result;
  }, [tunedModels, rawModels, seasonalProfiles, dowProfiles, caps, currentPlan, optimizedPlan,
      summaries, historicalFractions, stabilizedOptimalShares, portfolioMedianROAS,
      tunedPeriodWeights, diagnosis, channelProfiles]);

  // ── Step 12: Scenarios ────────────────────────────────────────────────────
  // Each tier uses tuned models for the forecast + tuned optimization.
  const scenarios = useMemo((): ScenarioOutput[] => {
    if (!sourceData) return [];
    const baseRevenue = currentPlan.totalPeriodRevenue;

    return SCENARIO_TIERS.map(tier => {
      const tierBudget = Math.round(safeBudget * tier.monthlyMultiplier / 1000) * 1000;

      // Compute tier-specific optimal allocation with tuned models at this budget level
      const tierOptimal = Object.keys(tunedPeriodWeights).length > 0 && tunedModels.length > 0
        ? computeTunedOptimalShares(tunedModels, tierBudget, tunedPeriodWeights, channelProfiles)
        : getOptimalSharesForPeriod({ data: sourceData, selectedMonths: selectedRange, monthlyBudget: tierBudget });

      const tierPlan = buildMonthlyPlanFromData({
        data: sourceData, selectedMonths: selectedRange,
        monthlyBudget: tierBudget, modeMultiplier,
        allocationShares: tierOptimal, saturationModels: tunedModels,
      });

      const periodBudget  = tierBudget * durationMonths;
      const periodRevenue = tierPlan.totalRevenue;
      const blendedROAS   = periodBudget > 0 ? periodRevenue / periodBudget : 0;

      return {
        key: tier.key, label: tier.label, monthlyMultiplier: tier.monthlyMultiplier,
        monthlyBudget: tierBudget, periodBudget, periodRevenue, blendedROAS,
        deltaRevenue: periodRevenue - baseRevenue,
        deltaROAS:    blendedROAS   - currentPlan.blendedROAS,
      };
    });
  }, [sourceData, selectedRange, safeBudget, modeMultiplier, tunedModels,
      tunedPeriodWeights, channelProfiles, durationMonths, currentPlan]);

  const marginalNotes = useMemo((): MarginalNote[] => {
    const notes: MarginalNote[] = [];
    for (let i = 0; i < scenarios.length - 1; i++) {
      const a = scenarios[i], b = scenarios[i + 1];
      const extra = b.periodBudget - a.periodBudget;
      const gain  = b.periodRevenue - a.periodRevenue;
      if (extra > 0) notes.push({ from: a.label, to: b.label, marginalROAS: gain / extra, extraBudget: extra, extraRevenue: gain });
    }
    return notes;
  }, [scenarios]);

  const scenarioInterpretation = useMemo(() => {
    const base = scenarios.find(s => s.key === 'current');
    const agg  = scenarios.find(s => s.key === 'aggressive');
    if (!base || !agg) return '';
    const extra = agg.periodBudget - base.periodBudget;
    const gain  = agg.periodRevenue - base.periodRevenue;
    const marg  = extra > 0 ? gain / extra : 0;
    return `Moving from ${formatINRCompact(base.monthlyBudget)}/mo to ${formatINRCompact(agg.monthlyBudget)}/mo adds ${formatINRCompact(gain)} in revenue at a marginal ROAS of ${marg.toFixed(2)}x — ` +
      (marg < 2
        ? 'diminishing returns are steep above the current budget level.'
        : 'there is still meaningful return available at higher spend.');
  }, [scenarios]);

  const dataRange = useMemo(() => {
    if (!data?.length) return null;
    let min = data[0].date, max = data[0].date;
    for (const r of data) { if (r.date < min) min = r.date; if (r.date > max) max = r.date; }
    return { min, max };
  }, [data]);

  // ── Return the full model output ────────────────────────────────────────────
  return {
    isLoading, dataSource: dataSource || 'mock', dataUpdatedAt, dataRange, totalHistoricalMonths,
    selectedRange, durationMonths, monthlyBudget: safeBudget, totalPeriodBudget, modeMultiplier,
    historicalFractions, portfolioROAS: portfolioMedianROAS,
    currentPlan, optimizedPlan,
    diagnosis, flaggedChannels, overWeightedChannels, underWeightedChannels,
    uplift, recommendations,
    explanation,
    scenarios, marginalNotes, scenarioInterpretation,
    debug: {
      calibration: calibration ?? {
        channelProfiles: {},
        seasonalityProfiles: {},
        dowProfiles: {},
        tunedModels: rawModels,
        portfolioMedianROAS: portfolioROAS,
        portfolioAvgConfidence: 0.5,
      },
      tunedPeriodWeights,
      rawPeriodWeights,
      portfolioAvgConfidence,
    },
  };
}

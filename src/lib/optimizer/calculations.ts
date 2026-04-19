import { CHANNELS, type MarketingRecord } from '@/lib/mockData';
import { getAggregatedState, type AggregatedState } from '@/lib/calculations';
import { DEFAULT_MONTHLY_BUDGET } from '@/contexts/OptimizerContext';

export type OptimizerPlanningMode = 'conservative' | 'target' | 'aggressive';
export type ChannelHealthStatus = 'under-scaled' | 'over-scaled' | 'saturated' | 'efficient';
export type SignalStrength = 'strong' | 'moderate' | 'weak';

export interface MonthlyPoint {
  monthKey: string;
  spend: number;
  revenue: number;
  roas: number;
}

export interface FittedCurve {
  a: number;
  b: number;
}

export interface ChannelBaseline {
  channel: string;
  totalSpend: number;
  totalRevenue: number;
  historicalROAS: number;
  historicalAllocationPct: number;
  avgMonthlySpend: number;
  avgMonthlyRevenue: number;
  monthlyROASMean: number;
  monthlyROASStd: number;
  monthlyROASCV: number;
  activeMonths: number;
  monthlyPoints: MonthlyPoint[];
  curve: FittedCurve;
}

export interface TimingChannelEffects {
  monthlyIndex: number[];
  monthlyStrength: SignalStrength;
  peakMonth: number;
  peakBoost: number;
  dowIndex: number[];
  dowStrength: SignalStrength;
  bestDay: number;
  worstDay: number;
  weekendBias: 'weekday' | 'weekend' | 'neutral';
}

export interface TimingEffects {
  byChannel: Record<string, TimingChannelEffects>;
}

export interface HealthClassification {
  status: ChannelHealthStatus;
  lowerEfficientSpend: number;
  upperEfficientSpend: number;
  saturationSpend: number;
  currentSpend: number;
  marginalROAS: number;
}

export interface ForecastChannelRow {
  channel: string;
  allocationPct: number;
  forecastSpend: number;
  forecastRevenue: number;
  forecastROAS: number;
  marginalROAS: number;
  lowerEfficientSpend: number;
  upperEfficientSpend: number;
  saturationSpend: number;
}

export interface MixForecast {
  channels: Record<string, ForecastChannelRow>;
  totalSpend: number;
  totalRevenue: number;
  blendedROAS: number;
}

export interface RecommendedMixOutput {
  allocationsPct: Record<string, number>;
  efficiencyAllocationPct: Record<string, number>;
  weightedEfficiency: Record<string, number>;
  forecast: MixForecast;
}

export interface ScenarioOutput {
  budget: number;
  allocationsPct: Record<string, number>;
  totalRevenue: number;
  blendedROAS: number;
}

type StateInput = MarketingRecord[] | AggregatedState;

function asState(data: StateInput): AggregatedState {
  return Array.isArray(data) ? getAggregatedState(data) : data;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function normalizePct(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const ch of CHANNELS) {
    const v = Math.max(0, Number.isFinite(input[ch]) ? input[ch] : 0);
    out[ch] = v;
    sum += v;
  }
  if (sum <= 0) {
    const even = 100 / CHANNELS.length;
    for (const ch of CHANNELS) out[ch] = even;
    return out;
  }
  for (const ch of CHANNELS) out[ch] = (out[ch] / sum) * 100;
  return out;
}

function normalizeToShares(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const ch of CHANNELS) {
    const v = Math.max(0, Number.isFinite(input[ch]) ? input[ch] : 0);
    out[ch] = v;
    sum += v;
  }
  if (sum <= 0) {
    const even = 1 / CHANNELS.length;
    for (const ch of CHANNELS) out[ch] = even;
    return out;
  }
  for (const ch of CHANNELS) out[ch] = out[ch] / sum;
  return out;
}

function solveSpendAtMarginalROAS(curve: FittedCurve, threshold: number): number {
  if (!Number.isFinite(curve.a) || !Number.isFinite(curve.b) || curve.a <= 0 || curve.b <= 0 || curve.b >= 1 || threshold <= 0) {
    return Infinity;
  }
  const base = threshold / (curve.a * curve.b);
  if (base <= 0) return Infinity;
  const exponent = 1 / (curve.b - 1);
  const spend = Math.pow(base, exponent);
  return Number.isFinite(spend) && spend > 0 ? spend : Infinity;
}

function monthlyPointsForChannel(state: AggregatedState, channel: string): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (const [monthKey, byChannel] of Object.entries(state.monthlyMap)) {
    const m = byChannel[channel];
    if (!m) continue;
    const spend = Number(m.spend) || 0;
    const revenue = Number(m.revenue) || 0;
    if (spend <= 0) continue;
    points.push({
      monthKey,
      spend,
      revenue,
      roas: revenue / spend,
    });
  }
  points.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return points;
}

export function fitDiminishingReturnsCurve(monthlyData: Array<{ spend: number; revenue: number }>): FittedCurve {
  const clean = monthlyData.filter(p => Number.isFinite(p.spend) && Number.isFinite(p.revenue) && p.spend > 0 && p.revenue > 0);
  if (clean.length < 2) {
    const avgSpend = mean(clean.map(p => p.spend));
    const avgRevenue = mean(clean.map(p => p.revenue));
    const b = 0.7;
    const safeSpend = avgSpend > 0 ? avgSpend : 1;
    const safeRevenue = avgRevenue > 0 ? avgRevenue : 1;
    const a = safeRevenue / Math.pow(safeSpend, b);
    return { a: Number.isFinite(a) && a > 0 ? a : 1, b };
  }

  const xs = clean.map(p => Math.log(p.spend));
  const ys = clean.map(p => Math.log(p.revenue));
  const xMean = mean(xs);
  const yMean = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - xMean;
    num += dx * (ys[i] - yMean);
    den += dx * dx;
  }

  let b = den > 0 ? num / den : 0.7;
  b = clamp(b, 0.2, 0.95);
  const intercept = yMean - b * xMean;
  const a = Math.exp(intercept);
  return { a: Number.isFinite(a) && a > 0 ? a : 1, b };
}

export function computeChannelBaselines(rawData: StateInput): ChannelBaseline[] {
  const state = asState(rawData);
  const channelPoints: Record<string, MonthlyPoint[]> = {};
  CHANNELS.forEach(ch => {
    channelPoints[ch] = monthlyPointsForChannel(state, ch);
  });

  // Normalize model spend scale so historical monthly baseline aligns with the
  // product default monthly budget. This fixes budget-scale mismatch when
  // source data carries a much larger absolute spend level.
  const rawPortfolioMonthlySpend = CHANNELS.reduce((s, ch) => {
    const spends = channelPoints[ch].map(p => p.spend);
    return s + mean(spends);
  }, 0);
  const scaleFactor =
    rawPortfolioMonthlySpend > 0 ? DEFAULT_MONTHLY_BUDGET / rawPortfolioMonthlySpend : 1;

  const totals = CHANNELS.map(ch => {
    const points = channelPoints[ch].map(p => ({
      ...p,
      spend: p.spend * scaleFactor,
      revenue: p.revenue * scaleFactor,
      roas: p.spend > 0 ? p.revenue / p.spend : 0,
    }));
    const totalSpend = points.reduce((s, p) => s + p.spend, 0);
    const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
    return { ch, totalSpend, totalRevenue, points };
  });
  const portfolioSpend = totals.reduce((s, t) => s + t.totalSpend, 0);

  return totals.map(({ ch, totalSpend, totalRevenue, points }) => {
    const spends = points.map(p => p.spend);
    const revenues = points.map(p => p.revenue);
    const roasSeries = points.map(p => p.roas).filter(v => Number.isFinite(v) && v > 0);
    const monthlyROASMean = mean(roasSeries);
    const monthlyROASStd = stdev(roasSeries);
    const monthlyROASCV = monthlyROASMean > 0 ? monthlyROASStd / monthlyROASMean : 1;
    const rawCurve = fitDiminishingReturnsCurve(points);
    // Regularize elasticity around 0.7 and anchor the curve on observed monthly means.
    // This prevents unstable extrapolation (e.g. unrealistically high ROAS at lower spend).
    const regularizedB = clamp(0.5 * rawCurve.b + 0.5 * 0.7, 0.55, 0.9);
    const anchoredA =
      mean(spends) > 0 && mean(revenues) > 0
        ? mean(revenues) / Math.pow(mean(spends), regularizedB)
        : rawCurve.a;
    const curve = {
      a: Number.isFinite(anchoredA) && anchoredA > 0 ? anchoredA : rawCurve.a,
      b: regularizedB,
    };

    return {
      channel: ch,
      totalSpend,
      totalRevenue,
      historicalROAS: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      historicalAllocationPct: portfolioSpend > 0 ? (totalSpend / portfolioSpend) * 100 : 0,
      avgMonthlySpend: mean(spends),
      avgMonthlyRevenue: mean(revenues),
      monthlyROASMean,
      monthlyROASStd,
      monthlyROASCV,
      activeMonths: points.length,
      monthlyPoints: points,
      curve,
    };
  });
}

function classifySignalStrength(range: number): SignalStrength {
  if (range > 0.4) return 'strong';
  if (range >= 0.15) return 'moderate';
  return 'weak';
}

export function computeTimingEffects(rawData: StateInput): TimingEffects {
  const state = asState(rawData);
  const byChannel: Record<string, TimingChannelEffects> = {};

  for (const ch of CHANNELS) {
    const monthBuckets: number[][] = Array.from({ length: 12 }, () => []);
    for (const [monthKey, monthData] of Object.entries(state.monthlyMap)) {
      const entry = monthData[ch];
      if (!entry || entry.spend <= 0) continue;
      const month = Number(monthKey.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) monthBuckets[month].push(entry.revenue);
    }

    const monthAverages = monthBuckets.map(values => mean(values));
    const monthOverall = mean(monthAverages.filter(v => Number.isFinite(v) && v > 0));
    const monthlyIndex = monthAverages.map(v => (monthOverall > 0 ? v / monthOverall : 1));
    let peakMonth = 0;
    monthlyIndex.forEach((v, i) => {
      if (v > monthlyIndex[peakMonth]) peakMonth = i;
    });
    const monthRange = Math.max(...monthlyIndex) - Math.min(...monthlyIndex);

    const dowBuckets = state.dowMap[ch] || Array.from({ length: 7 }, () => ({ spend: 0, revenue: 0, count: 0 }));
    const revPerDay = dowBuckets.map(b => (b.count > 0 ? b.revenue / b.count : 0));
    const revOverall = mean(revPerDay.filter(v => Number.isFinite(v) && v > 0));
    const dowIndex = revPerDay.map(v => (revOverall > 0 ? v / revOverall : 1));
    let bestDay = 0;
    let worstDay = 0;
    dowIndex.forEach((v, i) => {
      if (v > dowIndex[bestDay]) bestDay = i;
      if (v < dowIndex[worstDay]) worstDay = i;
    });
    const dowRange = Math.max(...dowIndex) - Math.min(...dowIndex);
    const weekdayAvg = (dowIndex[1] + dowIndex[2] + dowIndex[3] + dowIndex[4] + dowIndex[5]) / 5;
    const weekendAvg = (dowIndex[0] + dowIndex[6]) / 2;
    const diff = weekendAvg - weekdayAvg;
    const weekendBias: 'weekday' | 'weekend' | 'neutral' = diff > 0.05 ? 'weekend' : diff < -0.05 ? 'weekday' : 'neutral';

    byChannel[ch] = {
      monthlyIndex,
      monthlyStrength: classifySignalStrength(monthRange),
      peakMonth,
      peakBoost: monthlyIndex[peakMonth] - 1,
      dowIndex,
      dowStrength: classifySignalStrength(dowRange),
      bestDay,
      worstDay,
      weekendBias,
    };
  }

  return { byChannel };
}

function channelTimingModifier(
  channel: string,
  timingEffects: TimingEffects | undefined,
  planningMonth: number | null | undefined,
): number {
  if (!timingEffects || planningMonth == null || planningMonth < 0 || planningMonth > 11) return 1;
  const t = timingEffects.byChannel[channel];
  if (!t) return 1;
  if (t.monthlyStrength === 'weak') return 1;
  const monthIndex = t.monthlyIndex[planningMonth] ?? 1;
  return 0.8 + 0.2 * monthIndex;
}

function curveRevenueAtSpend(curve: FittedCurve, spend: number): number {
  if (!Number.isFinite(spend) || spend <= 0) return 0;
  const { a, b } = curve;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  return a * Math.pow(spend, b);
}

function curveMarginalROAS(curve: FittedCurve, spend: number): number {
  if (!Number.isFinite(spend) || spend <= 0) return 0;
  const { a, b } = curve;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  return a * b * Math.pow(spend, b - 1);
}

export function classifyChannelHealth(
  baseline: ChannelBaseline,
  budget: number,
  allocationPct: number,
  portfolioBlendedROAS: number,
): HealthClassification {
  const currentSpend = (Math.max(0, allocationPct) / 100) * Math.max(0, budget);
  const lowerEfficientSpend = baseline.avgMonthlySpend * 0.5;
  const threshold = Math.max(1, portfolioBlendedROAS * 0.6);
  const solvedUpper = solveSpendAtMarginalROAS(baseline.curve, threshold);
  const upperEfficientSpend = Number.isFinite(solvedUpper) ? solvedUpper : baseline.avgMonthlySpend * 2.0;
  const saturationSpendSolved = solveSpendAtMarginalROAS(baseline.curve, 1.0);
  const saturationSpend = Number.isFinite(saturationSpendSolved) ? saturationSpendSolved : baseline.avgMonthlySpend * 2.5;
  const marginalROAS = curveMarginalROAS(baseline.curve, Math.max(currentSpend, 1));

  let status: ChannelHealthStatus = 'efficient';
  if (currentSpend >= saturationSpend * 0.7) status = 'saturated';
  else if (currentSpend > upperEfficientSpend && currentSpend < saturationSpend) status = 'over-scaled';
  else if (currentSpend < lowerEfficientSpend) status = 'under-scaled';
  else status = 'efficient';

  // Portfolio-relative overrides (order matters)
  // 1) High historical efficiency vs portfolio but starved budget share → under-invested
  if (
    portfolioBlendedROAS > 0 &&
    baseline.historicalROAS > 1.5 * portfolioBlendedROAS &&
    allocationPct < 5
  ) {
    status = 'under-scaled';
  } else if (baseline.historicalROAS < 1.8) {
    // 2) Weak historical ROAS → saturated (near breakeven; do not label as over-weighted)
    status = 'saturated';
  } else if (baseline.historicalROAS < 1.5 && allocationPct > 10) {
    status = 'over-scaled';
  } else if (baseline.historicalROAS > 10 && allocationPct < 8) {
    status = 'under-scaled';
  }

  return {
    status,
    lowerEfficientSpend,
    upperEfficientSpend,
    saturationSpend,
    currentSpend,
    marginalROAS,
  };
}

export function computeCurrentMixForecast(
  allocationsPctInput: Record<string, number>,
  budget: number,
  baselines: ChannelBaseline[],
  options?: {
    timingEffects?: TimingEffects;
    planningMonth?: number | null;
  },
): MixForecast {
  const allocationsPct = normalizePct(allocationsPctInput);
  const safeBudget = Math.max(0, budget);
  const channels: Record<string, ForecastChannelRow> = {};
  let totalRevenue = 0;

  const historicalPortfolioROAS = (() => {
    const totalSpend = baselines.reduce((s, b) => s + b.totalSpend, 0);
    const totalRev = baselines.reduce((s, b) => s + b.totalRevenue, 0);
    return totalSpend > 0 ? totalRev / totalSpend : 0;
  })();

  for (const ch of CHANNELS) {
    const baseline = baselines.find(b => b.channel === ch);
    if (!baseline) {
      channels[ch] = {
        channel: ch,
        allocationPct: allocationsPct[ch] || 0,
        forecastSpend: 0,
        forecastRevenue: 0,
        forecastROAS: 0,
        marginalROAS: 0,
        lowerEfficientSpend: 0,
        upperEfficientSpend: 0,
        saturationSpend: 0,
      };
      continue;
    }

    const allocationPct = allocationsPct[ch] || 0;
    const forecastSpend = (allocationPct / 100) * safeBudget;
    const timeModifier = channelTimingModifier(ch, options?.timingEffects, options?.planningMonth);
    let forecastRevenue = curveRevenueAtSpend(baseline.curve, forecastSpend) * timeModifier;

    // Fallback proxy (required by spec) if curve fit is degenerate.
    if (!Number.isFinite(forecastRevenue) || forecastRevenue <= 0) {
      const spendRatio = baseline.avgMonthlySpend > 0 ? forecastSpend / baseline.avgMonthlySpend : 0;
      forecastRevenue = baseline.avgMonthlyRevenue * Math.pow(Math.max(spendRatio, 0), 0.7);
    }

    const marginalROAS = curveMarginalROAS(baseline.curve, Math.max(forecastSpend, 1)) * timeModifier;
    const health = classifyChannelHealth(baseline, safeBudget, allocationPct, historicalPortfolioROAS);
    const forecastROAS = forecastSpend > 0 ? forecastRevenue / forecastSpend : 0;

    channels[ch] = {
      channel: ch,
      allocationPct,
      forecastSpend,
      forecastRevenue,
      forecastROAS,
      marginalROAS,
      lowerEfficientSpend: health.lowerEfficientSpend,
      upperEfficientSpend: health.upperEfficientSpend,
      saturationSpend: health.saturationSpend,
    };
    totalRevenue += forecastRevenue;
  }

  return {
    channels,
    totalSpend: safeBudget,
    totalRevenue,
    blendedROAS: safeBudget > 0 ? totalRevenue / safeBudget : 0,
  };
}

function applyBoundsAndNormalize(
  rawPct: Record<string, number>,
  activeChannels: string[],
  minPct = 2,
  maxPct = 35,
): Record<string, number> {
  const bounded: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    bounded[ch] = activeChannels.includes(ch) ? clamp(rawPct[ch] || 0, minPct, maxPct) : 0;
  });

  for (let iter = 0; iter < 80; iter += 1) {
    const activeTotal = activeChannels.reduce((s, ch) => s + bounded[ch], 0);
    const diff = 100 - activeTotal;
    if (Math.abs(diff) < 1e-6) break;

    if (diff > 0) {
      const room = activeChannels.map(ch => ({ ch, room: Math.max(0, maxPct - bounded[ch]) }));
      const totalRoom = room.reduce((s, r) => s + r.room, 0);
      if (totalRoom <= 0) break;
      room.forEach(r => {
        if (r.room <= 0) return;
        bounded[r.ch] += (diff * r.room) / totalRoom;
      });
    } else {
      const removable = activeChannels.map(ch => ({ ch, room: Math.max(0, bounded[ch] - minPct) }));
      const totalRemovable = removable.reduce((s, r) => s + r.room, 0);
      if (totalRemovable <= 0) break;
      removable.forEach(r => {
        if (r.room <= 0) return;
        bounded[r.ch] += (diff * r.room) / totalRemovable;
      });
    }

    activeChannels.forEach(ch => {
      bounded[ch] = clamp(bounded[ch], minPct, maxPct);
    });
  }

  const sum = activeChannels.reduce((s, ch) => s + bounded[ch], 0);
  if (sum > 0) {
    activeChannels.forEach(ch => {
      bounded[ch] = (bounded[ch] / sum) * 100;
    });
  }

  // Deterministic final correction to hit 100.00 exactly.
  const rounded: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    rounded[ch] = activeChannels.includes(ch) ? Number(bounded[ch].toFixed(4)) : 0;
  });
  const roundedSum = activeChannels.reduce((s, ch) => s + rounded[ch], 0);
  const adjust = 100 - roundedSum;
  if (activeChannels.length > 0 && Math.abs(adjust) > 1e-8) {
    const anchor = [...activeChannels].sort((a, b) => rounded[b] - rounded[a])[0];
    rounded[anchor] = Number((rounded[anchor] + adjust).toFixed(4));
  }
  return rounded;
}

export function computeRecommendedMix(
  baselines: ChannelBaseline[],
  budget: number,
  mode: OptimizerPlanningMode,
  currentAllocationPctInput: Record<string, number>,
  options?: {
    timingEffects?: TimingEffects;
    planningMonth?: number | null;
  },
): RecommendedMixOutput {
  const currentAllocationPct = normalizePct(currentAllocationPctInput);
  const activeChannels = baselines.filter(b => b.activeMonths > 0).map(b => b.channel);
  const explorationFactor = mode === 'conservative' ? 0.3 : mode === 'aggressive' ? 1.0 : 0.6;

  const totalHistSpend = baselines.reduce((s, b) => s + b.totalSpend, 0);
  const totalHistRev = baselines.reduce((s, b) => s + b.totalRevenue, 0);
  const portfolioHistoricalROAS = totalHistSpend > 0 ? totalHistRev / totalHistSpend : 0;

  const efficiencyScore: Record<string, number> = {};
  const weightedEfficiency: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const baseline = baselines.find(b => b.channel === ch);
    if (!baseline || !activeChannels.includes(ch)) {
      efficiencyScore[ch] = 0;
      weightedEfficiency[ch] = 0;
      continue;
    }
    const currentSpend = (currentAllocationPct[ch] / 100) * budget;
    const timingModifier = channelTimingModifier(ch, options?.timingEffects, options?.planningMonth);
    const marginal = curveMarginalROAS(baseline.curve, Math.max(currentSpend, 1)) * timingModifier;
    const confidence = 1 / (1 + Math.max(0, baseline.monthlyROASCV));
    efficiencyScore[ch] = marginal;
    let weighted = marginal * confidence;
    // Strong historical efficiency vs portfolio but current share &lt; 5% → prioritize reallocation (e.g. Email)
    if (
      portfolioHistoricalROAS > 0 &&
      baseline.historicalROAS > 1.5 * portfolioHistoricalROAS &&
      currentAllocationPct[ch] < 5
    ) {
      weighted *= 1.85;
    }
    weightedEfficiency[ch] = weighted;
  }

  const weightedSum = CHANNELS.reduce((s, ch) => s + weightedEfficiency[ch], 0);
  const efficiencyAllocationPct: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    efficiencyAllocationPct[ch] = weightedSum > 0 ? (weightedEfficiency[ch] / weightedSum) * 100 : 100 / CHANNELS.length;
  });

  const rawRecommendedPct: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    rawRecommendedPct[ch] =
      currentAllocationPct[ch] * (1 - explorationFactor) +
      efficiencyAllocationPct[ch] * explorationFactor;
  });

  const allocationsPct = applyBoundsAndNormalize(rawRecommendedPct, activeChannels, 2, 35);
  const forecast = computeCurrentMixForecast(allocationsPct, budget, baselines, options);

  return {
    allocationsPct,
    efficiencyAllocationPct,
    weightedEfficiency,
    forecast,
  };
}

export function computeBudgetScenarios(
  baselines: ChannelBaseline[],
  scenarios: number[],
  mode: OptimizerPlanningMode,
  currentAllocationPct: Record<string, number>,
  options?: {
    timingEffects?: TimingEffects;
    planningMonth?: number | null;
  },
): ScenarioOutput[] {
  return scenarios.map(budget => {
    const rec = computeRecommendedMix(baselines, budget, mode, currentAllocationPct, options);
    return {
      budget,
      allocationsPct: rec.allocationsPct,
      totalRevenue: rec.forecast.totalRevenue,
      blendedROAS: rec.forecast.blendedROAS,
    };
  });
}

export function normalizeAllocationShares(raw: Record<string, number>): Record<string, number> {
  return normalizeToShares(raw);
}


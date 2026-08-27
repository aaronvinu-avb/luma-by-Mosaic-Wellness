import { CHANNELS, type MarketingRecord } from '@/lib/mockData';
import { getAggregatedState, type AggregatedState } from '@/lib/calculations';
import { DEFAULT_MONTHLY_BUDGET } from '@/contexts/OptimizerContext';

export type OptimizerPlanningMode = 'conservative' | 'base' | 'aggressive';
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

/** Operational monthly spend caps from the assignment brief. */
export const CHANNEL_SPEND_CAPS: Record<string, number> = {
  Email: 1_500_000,
  SMS: 1_200_000,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rupeesToPct(alloc: Record<string, number>, budget: number): Record<string, number> {
  const out: Record<string, number> = {};
  const safeBudget = Math.max(0, budget);
  for (const ch of CHANNELS) {
    out[ch] = safeBudget > 0 ? (Math.max(0, alloc[ch] || 0) / safeBudget) * 100 : 0;
  }
  return out;
}

/**
 * Allocate `budget` in proportion to each channel's average ROAS, then
 * water-fill so Email ≤ ₹15L and SMS ≤ ₹12L. Leftover after a cap is
 * redistributed to uncapped channels by the same ROAS weights.
 */
export function allocateBudgetByAverageRoas(
  budget: number,
  roasByChannel: Record<string, number>,
  caps: Record<string, number> = CHANNEL_SPEND_CAPS,
): Record<string, number> {
  const alloc: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    alloc[ch] = 0;
  });
  const locked = new Set<string>();
  let remaining = Math.max(0, budget);

  for (let iter = 0; iter < CHANNELS.length + 3; iter += 1) {
    const free = CHANNELS.filter(ch => !locked.has(ch));
    if (free.length === 0 || remaining <= 1e-9) break;

    const weightSum = free.reduce((s, ch) => s + Math.max(0, roasByChannel[ch] || 0), 0);
    let overflow = false;

    if (weightSum <= 0) {
      const even = remaining / free.length;
      for (const ch of free) {
        const cap = caps[ch];
        if (cap != null && even > cap + 1e-9) {
          alloc[ch] = cap;
          locked.add(ch);
          overflow = true;
        }
      }
      if (overflow) {
        remaining = Math.max(0, budget - CHANNELS.reduce((s, ch) => s + alloc[ch], 0));
        continue;
      }
      for (const ch of free) alloc[ch] = even;
      remaining = 0;
      break;
    }

    for (const ch of free) {
      const proposed = remaining * (Math.max(0, roasByChannel[ch] || 0) / weightSum);
      const cap = caps[ch];
      if (cap != null && proposed > cap + 1e-9) {
        alloc[ch] = cap;
        locked.add(ch);
        overflow = true;
      }
    }

    if (overflow) {
      remaining = Math.max(0, budget - CHANNELS.reduce((s, ch) => s + alloc[ch], 0));
      continue;
    }

    for (const ch of free) {
      alloc[ch] = remaining * (Math.max(0, roasByChannel[ch] || 0) / weightSum);
    }
    remaining = 0;
    break;
  }

  const drift = budget - CHANNELS.reduce((s, ch) => s + alloc[ch], 0);
  if (Math.abs(drift) > 1e-6) {
    const receivers = CHANNELS
      .filter(ch => {
        const cap = caps[ch];
        const room = cap != null ? cap - alloc[ch] : Infinity;
        return room > 1e-9;
      })
      .sort((a, b) => (roasByChannel[b] || 0) - (roasByChannel[a] || 0));
    let leftover = drift;
    for (const ch of receivers) {
      if (Math.abs(leftover) <= 1e-9) break;
      const cap = caps[ch];
      const room = cap != null ? cap - alloc[ch] : Infinity;
      const take = leftover > 0 ? Math.min(room, leftover) : Math.max(-alloc[ch], leftover);
      alloc[ch] += take;
      leftover -= take;
    }
  }

  return alloc;
}

function enforceCapsOnSpend(
  seedSpend: Record<string, number>,
  budget: number,
  roasByChannel: Record<string, number>,
  caps: Record<string, number> = CHANNEL_SPEND_CAPS,
): Record<string, number> {
  const clipped: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    const cap = caps[ch];
    const raw = Math.max(0, seedSpend[ch] || 0);
    clipped[ch] = cap != null ? Math.min(raw, cap) : raw;
  });
  const used = CHANNELS.reduce((s, ch) => s + clipped[ch], 0);
  if (used >= budget - 1e-6) {
    if (used <= 0) return allocateBudgetByAverageRoas(budget, roasByChannel, caps);
    const scale = budget / used;
    CHANNELS.forEach(ch => {
      clipped[ch] *= scale;
    });
    return clipped;
  }
  const leftover = budget - used;
  const extra = allocateBudgetByAverageRoas(leftover, roasByChannel, {
    Email: Math.max(0, (caps.Email ?? Infinity) - clipped.Email),
    SMS: Math.max(0, (caps.SMS ?? Infinity) - clipped.SMS),
  });
  CHANNELS.forEach(ch => {
    clipped[ch] += extra[ch] || 0;
  });
  return clipped;
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

export function classifyChannelHealth(
  baseline: ChannelBaseline,
  budget: number,
  allocationPct: number,
  portfolioBlendedROAS: number,
): HealthClassification {
  const currentSpend = (Math.max(0, allocationPct) / 100) * Math.max(0, budget);
  const cap = CHANNEL_SPEND_CAPS[baseline.channel];
  const lowerEfficientSpend = baseline.avgMonthlySpend * 0.5;
  const upperEfficientSpend = cap != null ? cap : baseline.avgMonthlySpend * 2.0;
  const saturationSpend = cap != null ? cap : Infinity;
  const marginalROAS = baseline.historicalROAS;

  let status: ChannelHealthStatus = 'efficient';
  if (cap != null && currentSpend >= cap - 1e-6) {
    status = 'saturated';
  } else if (
    portfolioBlendedROAS > 0 &&
    baseline.historicalROAS > 1.5 * portfolioBlendedROAS &&
    allocationPct < 5
  ) {
    status = 'under-scaled';
  } else if (baseline.historicalROAS < 1.8 && allocationPct > 10) {
    status = 'over-scaled';
  } else if (currentSpend < lowerEfficientSpend && baseline.historicalROAS > portfolioBlendedROAS) {
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
  void options;
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
    const forecastRevenue = forecastSpend * Math.max(0, baseline.historicalROAS);
    const health = classifyChannelHealth(baseline, safeBudget, allocationPct, historicalPortfolioROAS);
    const forecastROAS = forecastSpend > 0 ? forecastRevenue / forecastSpend : 0;
    const marginalROAS = baseline.historicalROAS;

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
    totalRevenue: round2(totalRevenue),
    blendedROAS: safeBudget > 0 ? round2(totalRevenue) / safeBudget : 0,
  };
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
  void options;
  const currentAllocationPct = normalizePct(currentAllocationPctInput);
  const safeBudget = Math.max(0, budget);

  const roasByChannel: Record<string, number> = {};
  const weightedEfficiency: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const baseline = baselines.find(b => b.channel === ch);
    const roas = baseline && baseline.activeMonths > 0 ? Math.max(0, baseline.historicalROAS) : 0;
    roasByChannel[ch] = roas;
    weightedEfficiency[ch] = roas;
  }

  const officialSpend = allocateBudgetByAverageRoas(safeBudget, roasByChannel, CHANNEL_SPEND_CAPS);
  const efficiencyAllocationPct = rupeesToPct(officialSpend, safeBudget);

  // Base and aggressive: scored brief method. Conservative: keep 75% of current mix.
  const explorationFactor = mode === 'conservative' ? 0.25 : 1;

  const seedSpend: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    const currentSpend = ((currentAllocationPct[ch] || 0) / 100) * safeBudget;
    seedSpend[ch] = currentSpend * (1 - explorationFactor) + officialSpend[ch] * explorationFactor;
  });

  const recommendedSpend =
    explorationFactor >= 1
      ? officialSpend
      : enforceCapsOnSpend(seedSpend, safeBudget, roasByChannel, CHANNEL_SPEND_CAPS);

  const allocationsPct = rupeesToPct(recommendedSpend, safeBudget);
  const forecast = computeCurrentMixForecast(allocationsPct, safeBudget, baselines);

  return {
    allocationsPct,
    efficiencyAllocationPct,
    weightedEfficiency,
    forecast,
  };
}

/**
 * Budget ladder at fixed **current mix** allocations (same as `computeCurrentMixForecast`).
 * Revenue scales linearly with spend × historical ROAS; Email/SMS caps apply only to recommended mix.
 */
export function computeBudgetScenarios(
  baselines: ChannelBaseline[],
  scenarios: number[],
  _mode: OptimizerPlanningMode,
  currentAllocationPct: Record<string, number>,
  options?: {
    timingEffects?: TimingEffects;
    planningMonth?: number | null;
  },
): ScenarioOutput[] {
  void _mode;
  return scenarios.map(budget => {
    const forecast = computeCurrentMixForecast(currentAllocationPct, budget, baselines, options);
    const allocationsPct: Record<string, number> = {};
    for (const ch of CHANNELS) {
      allocationsPct[ch] = forecast.channels[ch]?.allocationPct ?? 0;
    }
    return {
      budget,
      allocationsPct,
      totalRevenue: forecast.totalRevenue,
      blendedROAS: forecast.blendedROAS,
    };
  });
}

export function normalizeAllocationShares(raw: Record<string, number>): Record<string, number> {
  return normalizeToShares(raw);
}


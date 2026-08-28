import { CHANNELS, type MarketingRecord } from '@/lib/mockData';
import { getAggregatedState, type AggregatedState } from '@/lib/calculations';
import {
  DAYS_PER_MONTH,
  allocateBudgetByMarginalRoas,
  buildChannelCaps,
  clipAndRefillByMarginalRoas,
  fitChannelResponseCurve,
  monthlyCurveMarginal,
  monthlyCurveRevenue,
  operationalCapForChannel,
  EMAIL_MONTHLY_CAP,
  SMS_MONTHLY_CAP,
  type FittedCurve,
} from '@/lib/optimizer/responseCurves';

export type { FittedCurve, MixValidationReport } from '@/lib/optimizer/responseCurves';
export { validateRecommendedAllocation, operationalCapForChannel } from '@/lib/optimizer/responseCurves';

export type OptimizerPlanningMode = 'conservative' | 'base' | 'aggressive';
export type ChannelHealthStatus = 'under-scaled' | 'over-scaled' | 'saturated' | 'efficient';
export type SignalStrength = 'strong' | 'moderate' | 'weak';

export interface MonthlyPoint {
  monthKey: string;
  spend: number;
  revenue: number;
  roas: number;
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
  /** Historical average ROAS (total revenue ÷ total spend). */
  historicalROAS: number;
  marginalROAS: number;
  limitedData: boolean;
  limitedJustification: string | null;
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

/** Operational monthly spend caps — applied only by channel name. */
export const CHANNEL_SPEND_CAPS: Record<string, number> = {
  Email: EMAIL_MONTHLY_CAP,
  SMS: SMS_MONTHLY_CAP,
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

export function computeChannelBaselines(rawData: StateInput): ChannelBaseline[] {
  const state = asState(rawData);
  const uniqueMonths = Object.keys(state.monthlyMap).length || 1;
  const daysPerMonth = state.totalDays > 0 ? state.totalDays / uniqueMonths : DAYS_PER_MONTH;

  const totals = CHANNELS.map(ch => {
    const points = monthlyPointsForChannel(state, ch);
    const totalSpend = points.reduce((s, p) => s + p.spend, 0);
    const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
    const daily = (state.dailySpendSeries?.[ch] || []).map(p => ({ spend: p.spend, revenue: p.revenue }));
    return { ch, totalSpend, totalRevenue, points, daily };
  });
  const portfolioSpend = totals.reduce((s, t) => s + t.totalSpend, 0);

  return totals.map(({ ch, totalSpend, totalRevenue, points, daily }) => {
    const spends = points.map(p => p.spend);
    const roasSeries = points.map(p => p.roas).filter(v => Number.isFinite(v) && v > 0);
    const monthlyROASMean = mean(roasSeries);
    const monthlyROASStd = stdev(roasSeries);
    const monthlyROASCV = monthlyROASMean > 0 ? monthlyROASStd / monthlyROASMean : 1;
    const historicalROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const dailyPoints = daily.length > 0
      ? daily
      : points.map(p => ({ spend: p.spend / daysPerMonth, revenue: p.revenue / daysPerMonth }));
    const curve = fitChannelResponseCurve(dailyPoints, spends, historicalROAS, daysPerMonth);

    return {
      channel: ch,
      totalSpend,
      totalRevenue,
      historicalROAS,
      historicalAllocationPct: portfolioSpend > 0 ? (totalSpend / portfolioSpend) * 100 : 0,
      avgMonthlySpend: uniqueMonths > 0 ? totalSpend / uniqueMonths : 0,
      avgMonthlyRevenue: uniqueMonths > 0 ? totalRevenue / uniqueMonths : 0,
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
  const cap = operationalCapForChannel(baseline.channel);
  const capped = Number.isFinite(cap) ? Math.min(cap, Math.max(0, budget)) : Math.max(0, budget);
  const lowerEfficientSpend = Math.min(baseline.avgMonthlySpend * 0.25, currentSpend);
  const upperEfficientSpend = Number.isFinite(cap) ? capped : baseline.avgMonthlySpend * 2.0;
  const saturationSpend = Number.isFinite(cap) ? capped : Infinity;
  const marginalROAS = monthlyCurveMarginal(baseline.curve, currentSpend);

  let status: ChannelHealthStatus = 'efficient';
  if (Number.isFinite(cap) && currentSpend >= capped - 1) {
    status = 'saturated';
  } else if (marginalROAS > Math.max(1.4, portfolioBlendedROAS) && allocationPct < 8) {
    status = 'under-scaled';
  } else if (marginalROAS < 1.2 && allocationPct > 10) {
    status = 'over-scaled';
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

function emptyForecastRow(channel: string, allocationPct: number): ForecastChannelRow {
  return {
    channel,
    allocationPct,
    forecastSpend: 0,
    forecastRevenue: 0,
    forecastROAS: 0,
    historicalROAS: 0,
    marginalROAS: 0,
    limitedData: false,
    limitedJustification: null,
    lowerEfficientSpend: 0,
    upperEfficientSpend: 0,
    saturationSpend: 0,
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
      channels[ch] = emptyForecastRow(ch, allocationsPct[ch] || 0);
      continue;
    }

    const allocationPct = allocationsPct[ch] || 0;
    const forecastSpend = (allocationPct / 100) * safeBudget;
    const forecastRevenue = monthlyCurveRevenue(baseline.curve, forecastSpend);
    const health = classifyChannelHealth(baseline, safeBudget, allocationPct, historicalPortfolioROAS);
    const forecastROAS = forecastSpend > 0 ? forecastRevenue / forecastSpend : 0;
    const marginalROAS = monthlyCurveMarginal(baseline.curve, forecastSpend);

    channels[ch] = {
      channel: ch,
      allocationPct,
      forecastSpend,
      forecastRevenue,
      forecastROAS,
      historicalROAS: baseline.historicalROAS,
      marginalROAS,
      limitedData: baseline.curve.limitedData,
      limitedJustification: baseline.curve.limitedJustification,
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

  const weightedEfficiency: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const baseline = baselines.find(b => b.channel === ch);
    weightedEfficiency[ch] = baseline ? monthlyCurveMarginal(baseline.curve, 0) : 0;
  }

  const caps = buildChannelCaps(baselines, CHANNEL_SPEND_CAPS, safeBudget);
  const officialSpend = allocateBudgetByMarginalRoas(safeBudget, baselines, caps);
  const efficiencyAllocationPct = rupeesToPct(officialSpend, safeBudget);

  const explorationFactor = mode === 'conservative' ? 0.25 : 1;

  const seedSpend: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    const currentSpend = ((currentAllocationPct[ch] || 0) / 100) * safeBudget;
    seedSpend[ch] = currentSpend * (1 - explorationFactor) + officialSpend[ch] * explorationFactor;
  });

  const recommendedSpend =
    explorationFactor >= 1
      ? officialSpend
      : clipAndRefillByMarginalRoas(seedSpend, safeBudget, baselines, CHANNEL_SPEND_CAPS);

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
 * Budget ladder at a fixed channel mix. Revenue is the fitted curve at each budget,
 * so blended ROAS can fall as spend rises.
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


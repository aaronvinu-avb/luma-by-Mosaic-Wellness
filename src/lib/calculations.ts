import { MarketingRecord, CHANNELS } from './mockData';

// ─────────────────────────────────────────────────────────────────────────────
// Basic Summaries
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelSummary {
  channel: string;
  totalSpend: number;
  totalRevenue: number;
  roas: number;
  conversions: number;
  newCustomers: number;
  cpa: number;
}

/**
 * Comprehensive aggregated state calculated in a single pass over raw data.
 */
export interface AggregatedState {
  summaries: ChannelSummary[];
  monthlyMap: Record<string, Record<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number; newCustomers: number }>>;
  weeklyMap: Record<string, Record<string, { spend: number; revenue: number }>>; // WeekKey -> Channel -> Metrics
  yearlyRevenueMap: Record<string, number>; // YearKey -> Total Revenue
  dailySeries: Record<string, { date: string; roas: number }[]>; // Channel -> Last N days
  dowMap: Record<string, { spend: number; revenue: number; count: number }[]>; // Channel -> Day buckets [0..6]
  totalDays: number;
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Single-pass aggregator that builds the entire metrics state from raw data.
 * Complexity: O(N) where N is the number of records.
 */
export function getAggregatedState(data: MarketingRecord[]): AggregatedState {
  const start = performance.now();
  
  const summariesMap = new Map<string, { spend: number; revenue: number; conversions: number; newCustomers: number }>();
  const monthlyMap: AggregatedState['monthlyMap'] = {};
  const weeklyMap: AggregatedState['weeklyMap'] = {};
  const yearlyRevenueMap: Record<string, number> = {};
  const dailySeries: AggregatedState['dailySeries'] = {};
  const dowMap: AggregatedState['dowMap'] = {};
  const dateSet = new Set<string>();

  const DOW_ORDER: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Use string manipulation instead of new Date() for massive performance gains
  for (const r of data) {
    if (!r.date || !r.channel) continue;
    
    const { channel, spend, revenue, conversions, new_customers, date, day_of_week } = r;
    const impressions = r.impressions || 0;
    const clicks = r.clicks || 0;
    
    // 1. Channel Summary
    const ch = summariesMap.get(channel) || { spend: 0, revenue: 0, conversions: 0, newCustomers: 0 };
    ch.spend += spend || 0;
    ch.revenue += revenue || 0;
    ch.conversions += conversions || 0;
    ch.newCustomers += new_customers || 0;
    summariesMap.set(channel, ch);

    // 2. Monthly Aggregation
    const month = date.slice(0, 7); // YYYY-MM
    if (!monthlyMap[month]) monthlyMap[month] = {};
    if (!monthlyMap[month][channel]) {
      monthlyMap[month][channel] = { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, newCustomers: 0 };
    }
    const m = monthlyMap[month][channel];
    m.spend += spend || 0;
    m.revenue += revenue || 0;
    m.impressions += impressions;
    m.clicks += clicks;
    m.conversions += conversions || 0;
    m.newCustomers += new_customers || 0;

    // 3. Weekly Aggregation (Simplified single allocation)
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - (DOW_ORDER[day_of_week] || 0));
      const weekKey = formatLocalDateKey(weekStart);
      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = {};
      if (!weeklyMap[weekKey][channel]) weeklyMap[weekKey][channel] = { spend: 0, revenue: 0 };
      weeklyMap[weekKey][channel].spend += spend || 0;
      weeklyMap[weekKey][channel].revenue += revenue || 0;
    }

    // 4. Day of Week Aggregation (for Heatmap)
    if (!dowMap[channel]) {
      dowMap[channel] = Array.from({ length: 7 }, () => ({ spend: 0, revenue: 0, count: 0 }));
    }
    const dowIdx = DOW_ORDER[day_of_week] !== undefined ? DOW_ORDER[day_of_week] : 0;
    dowMap[channel][dowIdx].spend += spend || 0;
    dowMap[channel][dowIdx].revenue += revenue || 0;
    dowMap[channel][dowIdx].count += 1;

    // 5. Yearly Revenue Aggregation (for YoY)
    const year = date.slice(0, 4);
    yearlyRevenueMap[year] = (yearlyRevenueMap[year] || 0) + (revenue || 0);

    // 6. Daily Series for Sparklines
    if (!dailySeries[channel]) dailySeries[channel] = [];
    dailySeries[channel].push({ date, roas: (spend || 0) > 0 ? (revenue || 0) / spend : 0 });

    // 7. Timeframe tracking
    dateSet.add(date);
  }

  const summaries = CHANNELS.map(ch => {
    const c = summariesMap.get(ch) || { spend: 0, revenue: 0, conversions: 0, newCustomers: 0 };
    return {
      channel: ch,
      totalSpend: c.spend,
      totalRevenue: c.revenue,
      roas: c.spend > 0 ? c.revenue / c.spend : 0,
      conversions: c.conversions,
      newCustomers: c.newCustomers,
      cpa: c.conversions > 0 ? c.spend / c.conversions : 0,
    };
  });

  // Sort daily series by date (one-time cost per aggregation)
  for (const ch of CHANNELS) {
    if (dailySeries[ch]) {
      dailySeries[ch].sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  const end = performance.now();
  console.log(`[Luma] Aggregated all metrics in ${((end - start)).toFixed(2)}ms`);

  return {
    summaries,
    monthlyMap,
    weeklyMap,
    yearlyRevenueMap,
    dailySeries,
    dowMap,
    totalDays: dateSet.size
  };
}

/** State-aware channel summaries — works with both raw data and pre-aggregated state */
export function getChannelSummaries(data: MarketingRecord[] | AggregatedState): ChannelSummary[] {
  if ('summaries' in data) return data.summaries;
  if (!Array.isArray(data)) return [];
  return getAggregatedState(data).summaries;
}

export function getWeeklyROAS(data: MarketingRecord[] | AggregatedState, channel: string): { week: string; roas: number }[] {
  if ('weeklyMap' in data) {
    return Object.entries(data.weeklyMap)
      .map(([week, channels]) => ({
        week,
        roas: channels[channel] && channels[channel].spend > 0 ? channels[channel].revenue / channels[channel].spend : 0
      }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  const weekMap = new Map<string, { spend: number; revenue: number }>();
  for (const r of data as MarketingRecord[]) {
    if (r.channel !== channel) continue;
    const d = new Date(r.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = formatLocalDateKey(weekStart);
    const w = weekMap.get(key) || { spend: 0, revenue: 0 };
    w.spend += r.spend;
    w.revenue += r.revenue;
    weekMap.set(key, w);
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, roas: v.spend > 0 ? v.revenue / v.spend : 0 }));
}

export interface FatigueAlert {
  channel: string;
  dropPct: number;
  last8Weeks: { week: string; roas: number }[];
}

export function detectFatigue(data: MarketingRecord[] | AggregatedState): FatigueAlert[] {
  const alerts: FatigueAlert[] = [];
  for (const ch of CHANNELS) {
    const weekly = getWeeklyROAS(data, ch);
    if (weekly.length < 4) continue;
    const last8 = weekly.slice(-8);
    const recent = weekly.slice(-4);
    let declining = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].roas < recent[i - 1].roas) declining++;
      else declining = 0;
    }
    if (declining >= 3) {
      const dropPct = recent[0].roas > 0
        ? Math.round((1 - recent[recent.length - 1].roas / recent[0].roas) * 100)
        : 0;
      alerts.push({ channel: ch, dropPct, last8Weeks: last8 });
    }
  }
  return alerts;
}

export function getMonthlyAggregation(
  data: MarketingRecord[] | AggregatedState
): AggregatedState['monthlyMap'] {
  if ('monthlyMap' in data) return data.monthlyMap;
  return getAggregatedState(data).monthlyMap;
}

export function getDailySparkline(data: MarketingRecord[], channel: string, days = 7): number[] {
  const filtered = data.filter(r => r.channel === channel).sort((a, b) => a.date.localeCompare(b.date));
  return filtered.slice(-days).map(r => r.spend > 0 ? r.revenue / r.spend : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Diminishing Returns Model  (revenue = α · ln(spend + 1))
//
// We fit this on MONTHLY aggregated spend per channel, not daily, so that
// the alpha coefficient operates at the same scale as the monthly budget
// we optimise (₹50 L = 5,000,000).
// ─────────────────────────────────────────────────────────────────────────────

export interface SaturationModel {
  channel: string;
  /** Base log-scale coefficient (neutralized for seasonality) */
  alpha: number;
  /** Spend bucket → avg ROAS (for scatter chart) */
  scatterPoints: { spend: number; roas: number }[];
  /**
   * Neutral monthly spend level where marginal ROAS = 1 (breakeven).
   */
  saturationPoint: number;
}

export function getChannelSaturationModels(data: MarketingRecord[] | AggregatedState): SaturationModel[] {
  const monthly = getMonthlyAggregation(data);
  // Calculate seasonality indices first so we can normalize our saturation fitting
  const seasonalityIndices = getSeasonalityMetrics(data);

  return CHANNELS.map(channel => {
    const sea = seasonalityIndices.find(s => s.channel === channel);
    const indices = sea?.monthlyIndex || Array(12).fill(1);

    // Collect normalized (monthly_spend, monthly_revenue) pairs
    const points: { spend: number; revenue: number }[] = [];
    for (const [monthKey, monthData] of Object.entries(monthly)) {
      const c = monthData[channel];
      if (c && c.spend > 0) {
        const monthNum = parseInt(monthKey.slice(5, 7)) - 1; // 0..11
        const multiplier = indices[monthNum] || 1;
        // Normalize revenue by dividing by the seasonal multiplier
        // This gives us the "neutral" performance for fitting the base alpha
        points.push({ spend: c.spend, revenue: c.revenue / multiplier });
      }
    }

    if (points.length === 0) return { channel, alpha: 1, scatterPoints: [], saturationPoint: 0 };

    // alpha = weighted average of (normalized_revenue / ln(spend + 1))
    // We weight points by spend^0.5 to give more importance to high-spend periods
    // which represent the channel's behavior at scale better than low-spend noise.
    const alphaNum = points.reduce((acc, p) => {
      const a = p.revenue / Math.log(p.spend + 1);
      const weight = Math.sqrt(p.spend);
      return isFinite(a) && a > 0 ? acc + (a * weight) : acc;
    }, 0);
    const alphaDenom = points.reduce((acc, p) => {
      const weight = Math.sqrt(p.spend);
      return acc + weight;
    }, 0);
    const alpha = alphaDenom > 0 ? alphaNum / alphaDenom : 1;

    // Bucket into scatter points for the visual chart
    const sorted = [...points].sort((a, b) => a.spend - b.spend);
    const bucketSize = Math.max(1, Math.ceil(sorted.length / 20));
    const scatterPoints: { spend: number; roas: number }[] = [];
    for (let i = 0; i < sorted.length; i += bucketSize) {
      const bucket = sorted.slice(i, i + bucketSize);
      const totalSpend = bucket.reduce((s, p) => s + p.spend, 0);
      const totalRevenue = bucket.reduce((s, p) => s + p.revenue, 0);
      scatterPoints.push({
        spend: totalSpend / bucket.length,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      });
    }

    const saturationPoint = Math.max(0, alpha - 1);
    return { channel, alpha, scatterPoints, saturationPoint };
  });
}

/** Project monthly revenue using log model and optional seasonal multiplier */
export function projectRevenue(model: SaturationModel, spend: number, multiplier = 1.0): number {
  if (spend <= 0) return 0;
  return (model.alpha * multiplier) * Math.log(spend + 1);
}

/** Marginal ROAS: (α * multiplier) / (spend + 1) */
export function getMarginalROAS(model: SaturationModel, spend: number, multiplier = 1.0): number {
  return (model.alpha * multiplier) / (spend + 1);
}

/** Generate Marginal ROAS curve data across a spend range */
export function getMarginalROASCurve(
  model: SaturationModel,
  maxSpend: number,
  points = 40,
): { spend: number; marginalROAS: number; avgROAS: number }[] {
  return Array.from({ length: points }, (_, i) => {
    const spend = (maxSpend / points) * (i + 1);
    const rev = projectRevenue(model, spend);
    return {
      spend,
      marginalROAS: parseFloat(getMarginalROAS(model, spend).toFixed(4)),
      avgROAS: parseFloat((spend > 0 ? rev / spend : 0).toFixed(4)),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-Linear Optimal Allocation (Lagrange Multipliers)
//
// Maximise:  Σ αᵢ · ln(xᵢ + 1)
// Subject to: Σ xᵢ = B  (B = monthly budget)
//
// KKT: αᵢ / (xᵢ + 1) = λ  →  xᵢ = αᵢ/λ − 1
// Substituting: λ = Σαᵢ / (B + n_active)
//
// Channels whose unconstrained allocation would be negative are clamped to 0
// and the remainder are re-solved iteratively.
// ─────────────────────────────────────────────────────────────────────────────
export function getOptimalAllocationNonLinear(
  models: SaturationModel[],
  budget: number,
  excludedChannels: Set<string> = new Set(),
  multipliers: Record<string, number> = {},
): Record<string, number> {
  // Absolute spend per channel (rupees)
  const absoluteSpend: Record<string, number> = {};
  CHANNELS.forEach(ch => (absoluteSpend[ch] = 0));

  let active = models.filter(m => !excludedChannels.has(m.channel));
  const remainingBudget = budget;

  // We optimize: Maximize Σ (alpha_i * multiplier_i) * ln(x_i + 1)
  // KKT condition: (alpha_i * multiplier_i) / (x_i + 1) = lambda
  // x_i = (alpha_i * multiplier_i) / lambda - 1

  for (let iter = 0; iter < 20; iter++) {
    if (active.length === 0) break;

    const sumAlphaAdjusted = active.reduce((s, m) => s + (m.alpha * (multipliers[m.channel] || 1.0)), 0);
    const lambda = sumAlphaAdjusted / (remainingBudget + active.length);

    const unconstrained: Record<string, number> = {};
    let allPositive = true;
    for (const m of active) {
      const mult = multipliers[m.channel] || 1.0;
      const x = (m.alpha * mult) / lambda - 1;
      unconstrained[m.channel] = x;
      if (x < 0) allPositive = false;
    }

    if (allPositive) {
      const total = Object.values(unconstrained).reduce((s, v) => s + v, 0);
      const scale = total > 0 ? remainingBudget / total : 1;
      for (const m of active) absoluteSpend[m.channel] = unconstrained[m.channel] * scale;
      break;
    }

    const nextActive: typeof active = [];
    for (const m of active) {
      if (unconstrained[m.channel] < 0) {
        absoluteSpend[m.channel] = 0;
      } else {
        nextActive.push(m);
      }
    }
    active = nextActive;
  }

  const fractions: Record<string, number> = {};
  CHANNELS.forEach(ch => (fractions[ch] = budget > 0 ? absoluteSpend[ch] / budget : 0));
  return fractions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Precompute Scenario Projections (call once per budget scenario list)
// ─────────────────────────────────────────────────────────────────────────────
export interface ScenarioResult {
  budget: number;
  revenue: number;
  roas: number;
  fractions: Record<string, number>;
}

export function computeScenarios(
  models: SaturationModel[],
  budgets: number[],
  excludedChannels: Set<string> = new Set(),
  multipliers: Record<string, number> = {},
): ScenarioResult[] {
  return budgets.map(budget => {
    const fractions = getOptimalAllocationNonLinear(models, budget, excludedChannels, multipliers);
    const revenue = CHANNELS.reduce((s, ch) => {
      const m = models.find(x => x.channel === ch);
      const mult = multipliers[ch] || 1.0;
      return s + (m ? projectRevenue(m, (fractions[ch] || 0) * budget, mult) : 0);
    }, 0);
    return { budget, revenue, roas: budget > 0 ? revenue / budget : 0, fractions };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeframe Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function getTimeFrameMonths(data: MarketingRecord[] | AggregatedState): number {
  if (!data) return 1;
  
  // Use pre-calculated totalDays from state if available (O(1))
  if ('totalDays' in data) {
    return Math.max(1, data.totalDays / 30.41);
  }

  if (Array.isArray(data) && data.length > 0) {
    const dates = new Set(data.map(r => r.date));
    return Math.max(1, dates.size / 30.41);
  }

  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy linear allocation (kept for comparison)
// ─────────────────────────────────────────────────────────────────────────────
export function getOptimalAllocation(summaries: ChannelSummary[]): Record<string, number> {
  const totalWeight = summaries.reduce((s, c) => s + c.roas, 0);
  const alloc: Record<string, number> = {};
  for (const c of summaries) alloc[c.channel] = Math.min(0.6, Math.max(0.02, c.roas / totalWeight));
  const sum = Object.values(alloc).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(alloc)) alloc[k] = alloc[k] / sum;
  return alloc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seasonality Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonalityMetrics {
  channel: string;
  monthlyIndex: number[]; // 0..11
  peakMonth: number;
  troughMonth: number;
  peakBoost: number;
}

export function getSeasonalityMetrics(data: MarketingRecord[] | AggregatedState): SeasonalityMetrics[] {
  const monthly = getMonthlyAggregation(data);
  
  return CHANNELS.map(channel => {
    const monthBuckets: { spend: number; revenue: number }[] = Array.from({ length: 12 }, () => ({ spend: 0, revenue: 0 }));
    
    for (const [monthKey, monthData] of Object.entries(monthly)) {
      const c = monthData[channel];
      if (c) {
        const monthNum = (parseInt(monthKey.slice(5, 7)) - 1) % 12;
        if (!isNaN(monthNum)) {
          monthBuckets[monthNum].spend += c.spend;
          monthBuckets[monthNum].revenue += c.revenue;
        }
      }
    }

    const monthlyROAS = monthBuckets.map(b => (b.spend > 0 ? b.revenue / b.spend : 0));
    const activeMonths = monthBuckets.filter(b => b.spend > 0);
    const avgROAS = activeMonths.length > 0
      ? activeMonths.reduce((s, v) => s + (v.spend > 0 ? v.revenue / v.spend : 0), 0) / activeMonths.length
      : 1;
    const monthlyIndex = monthlyROAS.map(r => parseFloat((avgROAS > 0 ? r / avgROAS : 1).toFixed(3)));

    let peakMonth = 0, troughMonth = 0;
    monthlyIndex.forEach((v, i) => {
      if (v > monthlyIndex[peakMonth]) peakMonth = i;
      if (v < monthlyIndex[troughMonth]) troughMonth = i;
    });
    return { channel, monthlyIndex, peakMonth, troughMonth, peakBoost: monthlyIndex[peakMonth] - 1 };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Day-of-Week Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface DayOfWeekMetrics {
  channel: string;
  dowIndex: number[]; // 0=Sun … 6=Sat
  bestDay: number;
  worstDay: number;
  weekdayAvg: number;
  weekendAvg: number;
  weekendBias: 'weekday' | 'weekend' | 'neutral';
}

export function getDayOfWeekMetrics(data: MarketingRecord[] | AggregatedState): DayOfWeekMetrics[] {
  const state = 'dowMap' in data ? (data as AggregatedState) : getAggregatedState(data as MarketingRecord[]);
  const { dowMap } = state;

  return CHANNELS.map(channel => {
    const buckets = dowMap[channel] || Array.from({ length: 7 }, () => ({ spend: 0, revenue: 0 }));
    const dowROAS = buckets.map(b => (b.spend > 0 ? b.revenue / b.spend : 0));
    const avg = dowROAS.reduce((s, v) => s + v, 0) / 7 || 1;
    const dowIndex = dowROAS.map(r => parseFloat((avg > 0 ? r / avg : 1).toFixed(3)));

    let bestDay = 0, worstDay = 0;
    dowIndex.forEach((v, i) => {
      if (v > dowIndex[bestDay]) bestDay = i;
      if (v < dowIndex[worstDay]) worstDay = i;
    });
    const weekdayAvg = (dowIndex[1] + dowIndex[2] + dowIndex[3] + dowIndex[4] + dowIndex[5]) / 5;
    const weekendAvg = (dowIndex[0] + dowIndex[6]) / 2;
    const diff = weekendAvg - weekdayAvg;
    const weekendBias: 'weekday' | 'weekend' | 'neutral' =
      diff > 0.05 ? 'weekend' : diff < -0.05 ? 'weekday' : 'neutral';

    return { channel, dowIndex, bestDay, worstDay, weekdayAvg, weekendAvg, weekendBias };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Planning Engine (fully data-driven from observed history)
// ─────────────────────────────────────────────────────────────────────────────

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ChannelCapMetrics {
  channel: string;
  blendedROAS: number;
  bucketROAS: { low: number; medium: number; high: number };
  bucketSpend: { low: number; medium: number; high: number };
  capSpend: number;
  capReason: string;
}

export interface MonthPoint {
  key: string; // YYYY-MM
  year: number;
  month: number; // 0..11
}

export interface MonthlyPlanCell {
  channel: string;
  spend: number;
  revenue: number;
  baseROAS: number;
  seasonalityMultiplier: number;
  dayOfWeekMultiplier: number;
  capSpend: number;
  capped: boolean;
  inSeason: boolean;
  reason: string;
}

export interface MonthlyPlanRow {
  monthKey: string;
  label: string;
  totalSpend: number;
  totalRevenue: number;
  cells: Record<string, MonthlyPlanCell>;
}

export interface MonthlyPlanResult {
  rows: MonthlyPlanRow[];
  channelTotals: Record<string, { spend: number; revenue: number }>;
  totalSpend: number;
  totalRevenue: number;
  channelShares: Record<string, number>;
}

export function buildMonthRange(
  timelineMonths: MonthPoint[],
  currentMonthKey: string,
  period: '1m' | '1q' | '6m' | '1y' | 'custom',
  customStartMonth: string,
  customEndMonth: string,
): MonthPoint[] {
  if (period === 'custom') {
    const startIdx = timelineMonths.findIndex((m) => m.key === customStartMonth);
    const endIdx = timelineMonths.findIndex((m) => m.key === customEndMonth);
    if (startIdx < 0 || endIdx < 0) return [];
    return timelineMonths.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
  }
  const periodLength: Record<'1m' | '1q' | '6m' | '1y', number> = { '1m': 1, '1q': 3, '6m': 6, '1y': 12 };
  const startIdx = Math.max(0, timelineMonths.findIndex((m) => m.key === currentMonthKey));
  return timelineMonths.slice(startIdx, startIdx + periodLength[period]);
}

export function getChannelCapsFromData(data: MarketingRecord[] | AggregatedState): ChannelCapMetrics[] {
  const monthly = getMonthlyAggregation(data);
  return CHANNELS.map((channel) => {
    const points: { spend: number; roas: number }[] = [];
    for (const monthData of Object.values(monthly)) {
      const c = monthData[channel];
      if (c && c.spend > 0) points.push({ spend: c.spend, roas: c.revenue / c.spend });
    }
    if (points.length === 0) {
      return {
        channel,
        blendedROAS: 0,
        bucketROAS: { low: 0, medium: 0, high: 0 },
        bucketSpend: { low: 0, medium: 0, high: 0 },
        capSpend: Infinity,
        capReason: `${channel}: no historical spend data, so no cap applied.`,
      };
    }
    const sorted = [...points].sort((a, b) => a.spend - b.spend);
    const n = sorted.length;
    const lowEnd = Math.max(1, Math.floor(n / 3));
    const midEnd = Math.max(lowEnd + 1, Math.floor((2 * n) / 3));
    const low = sorted.slice(0, lowEnd);
    const medium = sorted.slice(lowEnd, midEnd);
    const high = sorted.slice(midEnd);
    const avg = (arr: { spend: number; roas: number }[], key: 'spend' | 'roas') =>
      arr.length > 0 ? arr.reduce((s, v) => s + v[key], 0) / arr.length : 0;
    const blendedROAS = avg(sorted, 'roas');
    const bucketROAS = { low: avg(low, 'roas'), medium: avg(medium, 'roas'), high: avg(high, 'roas') };
    const bucketSpend = { low: avg(low, 'spend'), medium: avg(medium, 'spend'), high: avg(high, 'spend') };
    let capSpend = Infinity;
    if (bucketROAS.medium > 0 && bucketROAS.medium < blendedROAS) capSpend = bucketSpend.medium;
    else if (bucketROAS.high > 0 && bucketROAS.high < blendedROAS) capSpend = bucketSpend.high;
    const capReason = Number.isFinite(capSpend)
      ? `${channel}: capped at ${Math.round(capSpend)} because ROAS falls below historical blended average at higher spend buckets.`
      : `${channel}: no observed ROAS drop below blended average across spend buckets.`;
    return { channel, blendedROAS, bucketROAS, bucketSpend, capSpend, capReason };
  });
}

export function getBestDaysByChannel(data: MarketingRecord[] | AggregatedState): Record<string, string[]> {
  const dow = getDayOfWeekMetrics(data);
  const bestDays: Record<string, string[]> = {};
  dow.forEach((row) => {
    const ranked = row.dowIndex
      .map((value, idx) => ({ value, idx }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((d) => DOW_SHORT[d.idx]);
    bestDays[row.channel] = ranked;
  });
  return bestDays;
}

function getMonthDayDistribution(year: number, month: number): number[] {
  const counts = Array(7).fill(0);
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    counts[d.getDay()] += 1;
    d.setDate(d.getDate() + 1);
  }
  const total = counts.reduce((s, c) => s + c, 0) || 1;
  return counts.map((c) => c / total);
}

function applyCapsAndRedistribute(
  rawSpend: Record<string, number>,
  capsByChannel: Record<string, number>,
): Record<string, number> {
  const spend = { ...rawSpend };
  for (let iter = 0; iter < CHANNELS.length + 2; iter++) {
    let excess = 0;
    const uncapped: string[] = [];
    CHANNELS.forEach((ch) => {
      const cap = capsByChannel[ch];
      if (Number.isFinite(cap) && spend[ch] > cap) {
        excess += spend[ch] - cap;
        spend[ch] = cap;
      } else {
        uncapped.push(ch);
      }
    });
    if (excess <= 1 || uncapped.length === 0) break;
    const uncappedTotal = uncapped.reduce((s, ch) => s + Math.max(0, spend[ch]), 0);
    if (uncappedTotal <= 0) {
      const equalAdd = excess / uncapped.length;
      uncapped.forEach((ch) => { spend[ch] += equalAdd; });
      break;
    }
    uncapped.forEach((ch) => {
      spend[ch] += excess * ((spend[ch] || 0) / uncappedTotal);
    });
  }
  return spend;
}

export function buildMonthlyPlanFromData(params: {
  data: MarketingRecord[] | AggregatedState;
  selectedMonths: MonthPoint[];
  monthlyBudget: number;
  modeMultiplier: number;
  allocationShares?: Record<string, number>;
  saturationModels?: SaturationModel[];
}): MonthlyPlanResult {
  const { data, selectedMonths, monthlyBudget, modeMultiplier, allocationShares, saturationModels } = params;
  const summaries = getChannelSummaries(data);
  const seasonality = getSeasonalityMetrics(data);
  const dow = getDayOfWeekMetrics(data);
  const caps = getChannelCapsFromData(data);

  const baseROAS: Record<string, number> = {};
  CHANNELS.forEach((ch) => {
    baseROAS[ch] = summaries.find((s) => s.channel === ch)?.roas || 0;
  });
  const roasDenom = CHANNELS.reduce((s, ch) => s + Math.max(0.0001, baseROAS[ch]), 0) || 1;

  // Build alpha map from saturation models (for log-model revenue projection)
  const alphaMap: Record<string, number> = {};
  if (saturationModels) {
    saturationModels.forEach((m) => { alphaMap[m.channel] = m.alpha; });
  }
  const useLogModel = saturationModels && saturationModels.length > 0;

  const seasonalityMap: Record<string, number[]> = {};
  seasonality.forEach((s) => { seasonalityMap[s.channel] = s.monthlyIndex; });

  const dowMap: Record<string, number[]> = {};
  dow.forEach((d) => { dowMap[d.channel] = d.dowIndex; });

  const capMap: Record<string, number> = {};
  caps.forEach((c) => { capMap[c.channel] = c.capSpend; });

  const channelTotals: Record<string, { spend: number; revenue: number }> = {};
  CHANNELS.forEach((ch) => { channelTotals[ch] = { spend: 0, revenue: 0 }; });

  const rows: MonthlyPlanRow[] = selectedMonths.map((monthPoint) => {
    const monthDistribution = getMonthDayDistribution(monthPoint.year, monthPoint.month);
    const rawSpendByChannel: Record<string, number> = {};
    CHANNELS.forEach((ch) => {
      const baseWeight = allocationShares ? Math.max(0, allocationShares[ch] || 0) : Math.max(0.0001, baseROAS[ch]) / roasDenom;
      const normalizedWeight = allocationShares
        ? baseWeight / (CHANNELS.reduce((sum, c) => sum + Math.max(0, allocationShares[c] || 0), 0) || 1)
        : baseWeight;
      rawSpendByChannel[ch] = monthlyBudget * normalizedWeight;
    });

    // Normalize spend to match budget exactly (no seasonality on spend — applied to revenue only)
    const rawTotal = CHANNELS.reduce((s, ch) => s + rawSpendByChannel[ch], 0) || 1;
    CHANNELS.forEach((ch) => {
      rawSpendByChannel[ch] = (rawSpendByChannel[ch] / rawTotal) * monthlyBudget;
    });

    const spendByChannel = applyCapsAndRedistribute(rawSpendByChannel, capMap);
    const totalSpend = CHANNELS.reduce((s, ch) => s + spendByChannel[ch], 0) || 1;
    CHANNELS.forEach((ch) => {
      spendByChannel[ch] = (spendByChannel[ch] / totalSpend) * monthlyBudget;
    });

    const monthLabel = new Date(monthPoint.year, monthPoint.month, 1).toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
    });

    const cells: Record<string, MonthlyPlanCell> = {};
    CHANNELS.forEach((ch) => {
      const seasonalityMult = seasonalityMap[ch]?.[monthPoint.month] ?? 1;
      const dowIndex = dowMap[ch] || Array(7).fill(1);
      const dayOfWeekMult = monthDistribution.reduce((acc, ratio, idx) => acc + ratio * (dowIndex[idx] ?? 1), 0) || 1;
      const spend = spendByChannel[ch];

      // Revenue projection:
      // Log model (concave):  revenue = alpha * ln(spend + 1) * seasonality * dow * mode
      // Linear fallback:      revenue = spend * ROAS * seasonality * dow * mode
      let revenue: number;
      const alpha = alphaMap[ch];
      if (useLogModel && alpha && alpha > 0 && spend > 0) {
        revenue = alpha * Math.log(spend + 1) * seasonalityMult * dayOfWeekMult * modeMultiplier;
      } else {
        revenue = spend * baseROAS[ch] * seasonalityMult * dayOfWeekMult * modeMultiplier;
      }

      const cap = capMap[ch];
      const inSeason = seasonalityMult >= 1;
      const effectiveROAS = spend > 0 ? revenue / spend : 0;
      cells[ch] = {
        channel: ch,
        spend,
        revenue,
        baseROAS: effectiveROAS,
        seasonalityMultiplier: seasonalityMult,
        dayOfWeekMultiplier: dayOfWeekMult,
        capSpend: cap,
        capped: Number.isFinite(cap) ? spend >= (cap - 1) : false,
        inSeason,
        reason: `${ch} gets ${Math.round(spend)} — effective ROAS ${effectiveROAS.toFixed(2)}x (seasonality ${seasonalityMult.toFixed(2)}x, weekday ${dayOfWeekMult.toFixed(2)}x).`,
      };
      channelTotals[ch].spend += spend;
      channelTotals[ch].revenue += revenue;
    });

    const rowTotalRevenue = CHANNELS.reduce((sum, ch) => sum + cells[ch].revenue, 0);
    return {
      monthKey: monthPoint.key,
      label: monthLabel,
      totalSpend: monthlyBudget,
      totalRevenue: rowTotalRevenue,
      cells,
    };
  });

  const totalSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const channelShares: Record<string, number> = {};
  CHANNELS.forEach((ch) => {
    channelShares[ch] = totalSpend > 0 ? channelTotals[ch].spend / totalSpend : 0;
  });

  return { rows, channelTotals, totalSpend, totalRevenue, channelShares };
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimal Allocation for a Planning Period (with seasonal weights + max cap)
//
// Wraps getOptimalAllocationNonLinear with:
// 1. Seasonal multipliers averaged over the planning months
// 2. Per-channel max cap (default 35%) to prevent unrealistic concentration
// 3. Min floor (1%) so no channel is completely zeroed out
// ─────────────────────────────────────────────────────────────────────────────
export function getOptimalSharesForPeriod(params: {
  data: MarketingRecord[] | AggregatedState;
  selectedMonths: MonthPoint[];
  monthlyBudget: number;
  maxChannelShare?: number;
  minChannelShare?: number;
}): Record<string, number> {
  const { data, selectedMonths, monthlyBudget, maxChannelShare = 0.35, minChannelShare = 0.01 } = params;
  const models = getChannelSaturationModels(data);
  const seasonality = getSeasonalityMetrics(data);

  // Compute average seasonal multiplier per channel across planning months
  const avgSeasonalMult: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    const sea = seasonality.find(s => s.channel === ch);
    if (!sea || selectedMonths.length === 0) { avgSeasonalMult[ch] = 1.0; return; }
    const sum = selectedMonths.reduce((s, mp) => s + (sea.monthlyIndex[mp.month] ?? 1), 0);
    avgSeasonalMult[ch] = sum / selectedMonths.length;
  });

  // Get unconstrained optimal allocation using non-linear solver
  const rawFractions = getOptimalAllocationNonLinear(models, monthlyBudget, new Set(), avgSeasonalMult);

  // Apply max cap and min floor, then renormalize
  const capped: Record<string, number> = {};
  let excess = 0;
  let uncappedTotal = 0;
  CHANNELS.forEach(ch => {
    const frac = rawFractions[ch] || 0;
    if (frac > maxChannelShare) {
      capped[ch] = maxChannelShare;
      excess += frac - maxChannelShare;
    } else if (frac < minChannelShare) {
      capped[ch] = minChannelShare;
      excess -= (minChannelShare - frac);
    } else {
      capped[ch] = frac;
      uncappedTotal += frac;
    }
  });

  // Redistribute excess proportionally among uncapped channels
  if (excess > 0 && uncappedTotal > 0) {
    CHANNELS.forEach(ch => {
      const frac = rawFractions[ch] || 0;
      if (frac <= maxChannelShare && frac >= minChannelShare) {
        capped[ch] = Math.min(maxChannelShare, capped[ch] + excess * (capped[ch] / uncappedTotal));
      }
    });
  }

  // Final normalization to exactly 100%
  const sum = CHANNELS.reduce((s, ch) => s + (capped[ch] || 0), 0);
  const result: Record<string, number> = {};
  CHANNELS.forEach(ch => { result[ch] = sum > 0 ? (capped[ch] || 0) / sum : 1 / CHANNELS.length; });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Insight Generation
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelInsight {
  channel: string;
  type: 'boost' | 'cut' | 'timing' | 'saturated';
  headline: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function generateChannelInsights(
  summaries: ChannelSummary[],
  models: SaturationModel[],
  seasonality: SeasonalityMetrics[],
  dowMetrics: DayOfWeekMetrics[],
  budget: number,
  optimalFractions: Record<string, number>,
  currentFractions: Record<string, number>,
): ChannelInsight[] {
  const avgROAS = summaries.reduce((s, c) => s + c.roas, 0) / (summaries.length || 1);
  const insights: ChannelInsight[] = [];

  for (const ch of CHANNELS) {
    const summary = summaries.find(s => s.channel === ch);
    const model = models.find(m => m.channel === ch);
    const sea = seasonality.find(s => s.channel === ch);
    const dow = dowMetrics.find(d => d.channel === ch);
    if (!summary || !model || !sea || !dow) continue;

    const currentSpend = (currentFractions[ch] || 0) * budget;
    const marginalNow = getMarginalROAS(model, currentSpend);
    const isSaturated = marginalNow < 1.0;
    const optFrac = optimalFractions[ch] || 0;
    const curFrac = currentFractions[ch] || 0;

    if (isSaturated) {
      insights.push({
        channel: ch,
        type: 'saturated',
        headline: `${ch} is past its saturation point`,
        rationale: `Marginal ROAS at current spend (₹${(currentSpend / 100000).toFixed(1)}L/mo) is ${marginalNow.toFixed(2)}x — each additional rupee returns less than ₹1. Reduce spend and reallocate to under-invested channels.`,
        priority: 'high',
      });
    }

    if (!isSaturated && summary.roas > avgROAS * 1.25 && optFrac > curFrac + 0.02) {
      insights.push({
        channel: ch,
        type: 'boost',
        headline: `Increase ${ch} budget by ~${Math.round((optFrac - curFrac) * 100)}%`,
        rationale: `Historical ROAS of ${summary.roas.toFixed(2)}x sits ${Math.round((summary.roas / avgROAS - 1) * 100)}% above portfolio average. Not yet saturated — marginal ROAS is still ${marginalNow.toFixed(2)}x. The optimizer recommends ${Math.round(optFrac * 100)}% allocation.`,
        priority: summary.roas > avgROAS * 1.6 ? 'high' : 'medium',
      });
    }

    if (summary.roas < avgROAS * 0.75 && optFrac < curFrac - 0.02) {
      insights.push({
        channel: ch,
        type: 'cut',
        headline: `Cut ${ch} spend by ~${Math.round((curFrac - optFrac) * 100)}%`,
        rationale: `ROAS of ${summary.roas.toFixed(2)}x is ${Math.round((1 - summary.roas / avgROAS) * 100)}% below portfolio average. Reallocating freed budget to ${summaries.reduce((b, c) => c.roas > b.roas ? c : b, summaries[0]).channel} could lift overall return.`,
        priority: 'medium',
      });
    }

    if (dow.weekendBias !== 'neutral') {
      insights.push({
        channel: ch,
        type: 'timing',
        headline: `${ch} peaks on ${dow.weekendBias === 'weekend' ? 'weekends' : 'weekdays'}`,
        rationale: `${DOW_NAMES[dow.bestDay]} is the top day (${((dow.dowIndex[dow.bestDay] - 1) * 100).toFixed(0)}% above average). Concentrating bids during ${dow.weekendBias === 'weekend' ? 'Sat–Sun' : 'Mon–Fri'} can improve efficiency without changing total spend.`,
        priority: 'low',
      });
    }

    if (sea.peakBoost > 0.12) {
      insights.push({
        channel: ch,
        type: 'timing',
        headline: `${ch} peaks in ${MONTH_NAMES[sea.peakMonth]} (+${Math.round(sea.peakBoost * 100)}%)`,
        rationale: `${MONTH_NAMES[sea.peakMonth]} shows a ${Math.round(sea.peakBoost * 100)}% ROAS uplift over the annual baseline. Front-loading budget into this window maximises return during peak demand periods.`,
        priority: sea.peakBoost > 0.22 ? 'high' : 'medium',
      });
    }
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return insights.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial & Unit Economics
// ─────────────────────────────────────────────────────────────────────────────

export interface FinancialMetric {
  channel: string;
  spend: number;
  revenue: number;
  profit: number;
  roi: number;
  cac: number;
  ltv: number;
  paybackDays: number;
}

const DEFAULT_MARGIN = 0.60; // 60% Contribution Margin
const LTV_MULTIPLIER = 3.5;  // Average customer makes 3.5 orders over lifetime

export function getFinancialMetrics(summaries: ChannelSummary[]): FinancialMetric[] {
  return summaries.map(s => {
    const revenue = s.totalRevenue;
    const spend = s.totalSpend;
    const profit = (revenue * DEFAULT_MARGIN) - spend;
    const roi = spend > 0 ? (profit / spend) * 100 : 0;
    
    const cac = s.newCustomers > 0 ? spend / s.newCustomers : 0;
    const aov = s.conversions > 0 ? revenue / s.conversions : 0;
    const ltv = aov * LTV_MULTIPLIER * DEFAULT_MARGIN;
    
    // Payback in terms of "Orders" = CAC / (AOV * Margin)
    // Convert to "Days" assuming a purchase cycle (simulated)
    const paybackOrders = aov > 0 ? cac / (aov * DEFAULT_MARGIN) : 0;
    const paybackDays = Math.round(paybackOrders * 45); // Assuming 45 days per purchase cycle average

    return {
      channel: s.channel,
      spend,
      revenue,
      profit,
      roi,
      cac,
      ltv,
      paybackDays,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cohort Analysis (Simulated Retention)
// ─────────────────────────────────────────────────────────────────────────────

export interface CohortData {
  week: number;
  retention: number;
  revenue: number;
}

/**
 * Simulates a cohort's revenue decay over 12 weeks for a specific channel.
 * Uses a decay function that varies by channel profile (e.g., Email is stickier).
 */
export function getSimulatedCohort(channel: string, baselineRevenue: number): CohortData[] {
  // Retention decay factors per channel
  const stickiness: Record<string, number> = {
    'Email': 0.85,
    'SMS': 0.80,
    'Organic Social': 0.75,
    'Influencer': 0.65,
    'Meta Ads': 0.60,
    'Instagram Reels': 0.60,
    'Google Search': 0.55,
    'YouTube': 0.50,
    'Affiliate': 0.45,
    'Google Display': 0.35,
  };

  const factor = stickiness[channel] || 0.5;
  const cohort: CohortData[] = [];
  
  for (let w = 0; w <= 12; w++) {
    // Week 0 is acquisition (100% of baseline)
    // Following weeks decay exponentially: Current * (Factor ^ Week)
    const retention = Math.pow(factor, w);
    cohort.push({
      week: w,
      retention: parseFloat((retention * 100).toFixed(1)),
      revenue: Math.round(baselineRevenue * retention)
    });
  }
  
  return cohort;
}


/**
 * optimizerCalibration.ts
 *
 * Converts raw historical signals into tuned, noise-reduced model inputs.
 *
 * Raw → Tuned pipeline:
 *   1. Per-channel monthly ROAS series  →  winsorized, spend-weighted tuned ROAS
 *   2. Saturation model alphas          →  confidence-adjusted tuned alphas
 *   3. Day-of-week indices              →  count-shrunk, smoothed tuned indices
 *   4. Seasonality indices              →  observation-shrunk, smoothed tuned indices
 *   5. Period time-weights              →  computed from tuned seasonality + dow
 *   6. Optimal allocation               →  computed with tuned models, then inertia-blended with historical
 *   7. Uplift                           →  classified into a confidence tier
 *
 * All tuning parameters live in CALIBRATION_CONFIG so they are visible and adjustable.
 * Raw values are preserved alongside tuned values for audit/debug use.
 */

import {
  getOptimalAllocationNonLinear,
  getMonthDayDistribution,
  type AggregatedState,
  type SaturationModel,
  type SeasonalityMetrics,
  type DayOfWeekMetrics,
} from './calculations';
import { CHANNELS } from './mockData';
import type { MonthPoint } from './calculations';

// ── Tuning parameters ─────────────────────────────────────────────────────────
// Collected here so every threshold is visible and auditable.

export const CALIBRATION_CONFIG = {
  roas: {
    /** Winsorization lower percentile for monthly ROAS (P5) */
    winsoriseLower: 0.05,
    /** Winsorization upper percentile for monthly ROAS (P95) */
    winsoriseUpper: 0.95,
    /** Monthly spend floor — months below this fraction of median spend are excluded before fitting */
    minSpendFractionOfMedian: 0.10,
  },
  confidence: {
    /** Months needed for any data confidence (below → 0 confidence) */
    minMonths: 2,
    /** Months needed for full confidence in the channel signal */
    fullMonths: 12,
    /** Coefficient of variation above which a channel is flagged high-volatility */
    highVolatilityCV: 0.50,
    /** Weight given to sample-size component in confidence score */
    sampleWeight: 0.60,
    /** Weight given to stability component in confidence score */
    stabilityWeight: 0.40,
  },
  alpha: {
    /**
     * Minimum blend factor for alpha tuning.
     * At zero confidence: tunedAlpha = rawAlpha * minBlend
     * At full confidence: tunedAlpha = rawAlpha
     */
    minBlend: 0.65,
  },
  dow: {
    /**
     * Number of observations per weekday bucket needed for full confidence.
     * ≈ 26 occurrences of each weekday (6 months of data).
     */
    refCountPerDay: 26,
    /**
     * Maximum range (max - min) allowed for tuned DOW indices before the
     * effect is flagged as 'strong'. Below this = 'moderate' or 'weak'.
     */
    strongRangeThreshold: 0.30,
    moderateRangeThreshold: 0.12,
  },
  seasonality: {
    /**
     * Observations per calendar-month slot needed for full confidence.
     * 2 full years of monthly data = 2 observations per slot.
     */
    refObsPerSlot: 2,
    /** peakBoost above this → 'strong' (after tuning) */
    strongPeakBoostThreshold: 0.22,
    /** peakBoost above this → 'moderate' (after tuning) */
    moderatePeakBoostThreshold: 0.08,
  },
  recommendation: {
    /**
     * Base fraction of historical allocation that is always retained (inertia).
     * 0.20 means at minimum 20% of the final share comes from the historical baseline.
     */
    inertiaBase: 0.20,
    /**
     * Additional inertia applied when portfolio average confidence is low.
     * Total inertia = inertiaBase + inertiaLowConfBoost * (1 − avgConfidence)
     * Caps at inertiaBase + inertiaLowConfBoost.
     */
    inertiaLowConfBoost: 0.25,
    /** Minimum per-channel max Δ from historical (even at zero confidence: ≥5pp) */
    maxDeltaFloor: 0.05,
    /** Maximum per-channel max Δ from historical (at full confidence: ≤18pp) */
    maxDeltaCeiling: 0.18,
  },
  uplift: {
    /** Minimum portfolio confidence + uplift% + strong-signal channels to reach 'high' tier */
    highConfidenceThreshold: 0.65,
    highUpliftPctThreshold: 1.5,
    highStrongChannels: 2,
    /** Minimum for 'moderate' tier */
    moderateConfidenceThreshold: 0.38,
    moderateUpliftPctThreshold: 0.30,
  },
} as const;

// ── Public types ──────────────────────────────────────────────────────────────

export interface TunedChannelProfile {
  channel: string;
  // ── Raw metrics (for audit) ────────────────────────────────────────────────
  rawROAS: number;
  rawMonthCount: number;
  /** Monthly ROAS series after no processing, for debug display */
  rawRoasSeries: number[];
  // ── Tuned metrics (used by the model) ────────────────────────────────────
  tunedROAS: number;           // spend-weighted, winsorized
  tunedAlpha: number;          // saturation model alpha after confidence haircut
  // ── Quality signals ────────────────────────────────────────────────────────
  /** 0–1. Combination of sample-size and stability. Used for inertia and alpha tuning. */
  efficiencyConfidence: number;
  /** 0–1. 1 − CV of monthly ROAS. Higher = more consistent channel. */
  stabilityScore: number;
  /** 0–1. CV of monthly ROAS. Lower is better. */
  volatilityScore: number;
  isHighVolatility: boolean;
  // ── Spend profile ─────────────────────────────────────────────────────────
  medianMonthlySpend: number;
  spendP25: number;
  spendP75: number;
  /** Spend levels beyond P90 are outside observed range — extrapolation risk zone */
  spendP90: number;
}

export interface TunedSeasonalityProfile {
  channel: string;
  rawMonthlyIndex: number[];   // 12 values from getSeasonalityMetrics
  tunedMonthlyIndex: number[]; // shrunk toward 1.0 + 3-month smoothed + renormalized
  confidence: number;          // 0–1 based on observations per calendar-month slot
  peakMonth: number;
  peakBoost: number;           // peak tuned index − 1
  seasonalityStrength: 'strong' | 'moderate' | 'weak';
}

export interface TunedDowProfile {
  channel: string;
  rawDowIndex: number[];    // 7 values from getDayOfWeekMetrics
  tunedDowIndex: number[];  // shrunk toward 1.0 + 3-point smoothed + renormalized
  confidence: number;       // 0–1 based on total observations per day bucket
  bestDay: number;
  worstDay: number;
  weekendBias: 'weekday' | 'weekend' | 'neutral';
  effectStrength: 'strong' | 'moderate' | 'weak';
}

export interface UpliftConfidence {
  tier: 'high' | 'moderate' | 'exploratory';
  note: string;
}

/** Complete output of one calibration pass (stable; only changes when sourceData changes). */
export interface CalibrationOutput {
  channelProfiles: Record<string, TunedChannelProfile>;
  seasonalityProfiles: Record<string, TunedSeasonalityProfile>;
  dowProfiles: Record<string, TunedDowProfile>;
  /** Saturation models with confidence-adjusted alpha coefficients */
  tunedModels: SaturationModel[];
  portfolioMedianROAS: number;
  portfolioAvgConfidence: number;
}

// ── Statistical helpers ───────────────────────────────────────────────────────

/** Winsorize array: clip values outside [P_lower, P_upper] to those bounds. */
function winsorize(arr: number[], lower = 0.05, upper = 0.95): number[] {
  if (arr.length < 4) return arr; // too few points to winsorize meaningfully
  const sorted = [...arr].sort((a, b) => a - b);
  const lo = sorted[Math.round((sorted.length - 1) * lower)];
  const hi = sorted[Math.round((sorted.length - 1) * upper)];
  return arr.map(v => Math.max(lo, Math.min(hi, v)));
}

/** Spend-weighted mean of winsorized monthly ROAS points. */
function spendWeightedMean(points: { spend: number; roas: number }[]): number {
  const total = points.reduce((s, p) => s + p.spend, 0);
  if (total <= 0) return 0;
  return points.reduce((s, p) => s + (p.spend / total) * p.roas, 0);
}

/** Coefficient of variation (std / mean). Returns 0 for empty / zero-mean arrays. */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return 1;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Percentile value from a sorted copy of arr. */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * 3-point smooth for a circular array (e.g. 12 monthly values).
 * Neighbours wrap around — Jan is adjacent to Dec.
 */
function smoothCircular(arr: number[]): number[] {
  const n = arr.length;
  return arr.map((_, i) => {
    const prev = arr[(i - 1 + n) % n];
    const next = arr[(i + 1) % n];
    return 0.25 * prev + 0.50 * arr[i] + 0.25 * next;
  });
}

/**
 * 3-point smooth for a non-circular array (e.g. 7 DOW values).
 * Endpoints use a 2-point average with the adjacent value.
 */
function smoothLinear(arr: number[]): number[] {
  return arr.map((v, i) => {
    if (i === 0) return 0.70 * v + 0.30 * arr[1];
    if (i === arr.length - 1) return 0.70 * v + 0.30 * arr[i - 1];
    return 0.20 * arr[i - 1] + 0.60 * v + 0.20 * arr[i + 1];
  });
}

/** Renormalize an array so its mean equals 1.0. */
function normalizeMeanToOne(arr: number[]): number[] {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return mean > 0 ? arr.map(v => v / mean) : arr.map(() => 1);
}

// ── Channel profile calibration ───────────────────────────────────────────────

function calibrateChannelProfiles(
  state: AggregatedState,
  rawModels: SaturationModel[],
): Record<string, TunedChannelProfile> {
  const { roas: roasCfg, confidence: confCfg, alpha: alphaCfg } = CALIBRATION_CONFIG;
  const profiles: Record<string, TunedChannelProfile> = {};

  // ── Pass 1: build per-channel monthly point arrays ────────────────────────
  const channelMonthlyPoints: Record<string, { spend: number; roas: number }[]> = {};
  for (const ch of CHANNELS) {
    const points: { spend: number; roas: number }[] = [];
    for (const [, monthData] of Object.entries(state.monthlyMap)) {
      const c = monthData[ch];
      if (c && c.spend > 0) {
        points.push({ spend: c.spend, roas: c.revenue / c.spend });
      }
    }
    channelMonthlyPoints[ch] = points;
  }

  // ── Pass 2: compute profiles with outlier-robust metrics ─────────────────
  for (const ch of CHANNELS) {
    const allPoints = channelMonthlyPoints[ch];
    const rawMonthCount = allPoints.length;

    // Compute median spend to filter out tiny-spend noise months
    const medianSpend = percentile(allPoints.map(p => p.spend), 0.50);
    const minSpend = medianSpend * roasCfg.minSpendFractionOfMedian;

    // Filter months with meaningful spend (avoids near-zero spend distorting ROAS)
    const qualityPoints = allPoints.filter(p => p.spend >= minSpend);
    const usedPoints = qualityPoints.length >= 2 ? qualityPoints : allPoints;

    // Raw ROAS (simple spend-weighted, no winsorization)
    const rawROAS = spendWeightedMean(usedPoints);

    // Winsorize ROAS values before computing tuned ROAS
    const rawRoasSeries = usedPoints.map(p => p.roas);
    const winsorized = winsorize(rawRoasSeries, roasCfg.winsoriseLower, roasCfg.winsoriseUpper);
    const winsorizedPoints = usedPoints.map((p, i) => ({ spend: p.spend, roas: winsorized[i] }));
    const tunedROAS = spendWeightedMean(winsorizedPoints);

    // Volatility (CV of raw monthly ROAS, not winsorized — we want to see the real noise)
    const volatilityScore = Math.min(1, coefficientOfVariation(rawRoasSeries.filter(r => r > 0)));
    const stabilityScore  = Math.max(0, 1 - volatilityScore);

    // Confidence: blend of sample-size confidence and stability confidence
    const sampleConf   = Math.min(1, Math.max(0,
      (rawMonthCount - confCfg.minMonths) / Math.max(1, confCfg.fullMonths - confCfg.minMonths),
    ));
    const stabilityConf = stabilityScore;
    const efficiencyConfidence = confCfg.sampleWeight * sampleConf + confCfg.stabilityWeight * stabilityConf;

    // Spend distribution
    const spendValues = allPoints.map(p => p.spend);
    const spendP25 = percentile(spendValues, 0.25);
    const spendP75 = percentile(spendValues, 0.75);
    const spendP90 = percentile(spendValues, 0.90);

    // Alpha tuning: confidence haircut on the log-model coefficient
    // Low-confidence channels get a haircut to prevent over-investment signals
    const rawAlpha = rawModels.find(m => m.channel === ch)?.alpha ?? 1;
    const alphaBlend = alphaCfg.minBlend + (1 - alphaCfg.minBlend) * efficiencyConfidence;
    const tunedAlpha = rawAlpha * alphaBlend;

    profiles[ch] = {
      channel: ch,
      rawROAS, rawMonthCount, rawRoasSeries,
      tunedROAS, tunedAlpha,
      efficiencyConfidence, stabilityScore, volatilityScore,
      isHighVolatility: volatilityScore > confCfg.highVolatilityCV,
      medianMonthlySpend: medianSpend,
      spendP25, spendP75, spendP90,
    };
  }

  return profiles;
}

// ── Seasonality calibration ────────────────────────────────────────────────────

function calibrateSeasonality(
  state: AggregatedState,
  rawSeasonality: SeasonalityMetrics[],
): Record<string, TunedSeasonalityProfile> {
  const cfg = CALIBRATION_CONFIG.seasonality;
  const profiles: Record<string, TunedSeasonalityProfile> = {};

  for (const ch of CHANNELS) {
    const raw = rawSeasonality.find(s => s.channel === ch);
    if (!raw) continue;
    const rawMonthlyIndex = raw.monthlyIndex;

    // Count observations per calendar-month slot
    const slotCounts = Array(12).fill(0) as number[];
    for (const [monthKey, monthData] of Object.entries(state.monthlyMap)) {
      const c = monthData[ch];
      if (c && c.spend > 0) {
        const m = parseInt(monthKey.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) slotCounts[m]++;
      }
    }

    // Per-slot shrinkage toward 1.0 — sparse slots stay neutral
    const shrunk = rawMonthlyIndex.map((idx, m) => {
      const shrinkWeight = Math.min(1, slotCounts[m] / cfg.refObsPerSlot);
      return shrinkWeight * idx + (1 - shrinkWeight) * 1.0;
    });

    // 3-month circular smooth to remove single-month artifacts
    const smoothed = smoothCircular(shrunk);

    // Renormalize so the mean index = 1.0 (preserves interpretability)
    const tunedMonthlyIndex = normalizeMeanToOne(smoothed);

    // Effect metadata
    const totalObs = slotCounts.reduce((s, n) => s + n, 0);
    const minSlotObs = Math.min(...slotCounts);
    const confidence = Math.min(1, minSlotObs / cfg.refObsPerSlot);

    let peakMonth = 0;
    tunedMonthlyIndex.forEach((v, m) => { if (v > tunedMonthlyIndex[peakMonth]) peakMonth = m; });
    const peakBoost = tunedMonthlyIndex[peakMonth] - 1;

    const seasonalityStrength: 'strong' | 'moderate' | 'weak' =
      peakBoost > cfg.strongPeakBoostThreshold   && confidence > 0.4 ? 'strong' :
      peakBoost > cfg.moderatePeakBoostThreshold  && confidence > 0.2 ? 'moderate' : 'weak';

    profiles[ch] = {
      channel: ch, rawMonthlyIndex, tunedMonthlyIndex, confidence,
      peakMonth, peakBoost, seasonalityStrength,
    };

    // Suppress TypeScript "declared but never read" for totalObs (it's purely informational)
    void totalObs;
  }

  return profiles;
}

// ── Day-of-week calibration ────────────────────────────────────────────────────

function calibrateDow(
  state: AggregatedState,
  rawDow: DayOfWeekMetrics[],
): Record<string, TunedDowProfile> {
  const cfg = CALIBRATION_CONFIG.dow;
  const profiles: Record<string, TunedDowProfile> = {};

  for (const ch of CHANNELS) {
    const raw = rawDow.find(d => d.channel === ch);
    if (!raw) continue;

    const dowBuckets = state.dowMap[ch] ?? Array.from({ length: 7 }, () => ({ spend: 0, revenue: 0, count: 0 }));
    const obsCounts  = dowBuckets.map(b => b.count);

    // Per-day shrinkage toward 1.0 — days with few observations stay neutral
    const shrunk = raw.dowIndex.map((idx, d) => {
      const shrinkWeight = Math.min(1, obsCounts[d] / cfg.refCountPerDay);
      return shrinkWeight * idx + (1 - shrinkWeight) * 1.0;
    });

    // 3-point linear smooth (no circular wrap — Sat and Sun are not adjacent in a work-week)
    const smoothed = smoothLinear(shrunk);

    // Renormalize to mean = 1.0
    const tunedDowIndex = normalizeMeanToOne(smoothed);

    // Confidence based on total observations across all day-buckets
    const totalObs = obsCounts.reduce((s, n) => s + n, 0);
    const confidence = Math.min(1, totalObs / (7 * cfg.refCountPerDay));

    // Best / worst day
    let bestDay = 0, worstDay = 0;
    tunedDowIndex.forEach((v, d) => {
      if (v > tunedDowIndex[bestDay]) bestDay = d;
      if (v < tunedDowIndex[worstDay]) worstDay = d;
    });

    // Weekend bias
    const weekdayAvg = (tunedDowIndex[1] + tunedDowIndex[2] + tunedDowIndex[3] + tunedDowIndex[4] + tunedDowIndex[5]) / 5;
    const weekendAvg = (tunedDowIndex[0] + tunedDowIndex[6]) / 2;
    const diff = weekendAvg - weekdayAvg;
    const weekendBias: 'weekday' | 'weekend' | 'neutral' =
      diff > 0.05 ? 'weekend' : diff < -0.05 ? 'weekday' : 'neutral';

    // Effect strength
    const range = Math.max(...tunedDowIndex) - Math.min(...tunedDowIndex);
    const effectStrength: 'strong' | 'moderate' | 'weak' =
      range > cfg.strongRangeThreshold   && confidence > 0.4 ? 'strong' :
      range > cfg.moderateRangeThreshold  && confidence > 0.2 ? 'moderate' : 'weak';

    profiles[ch] = {
      channel: ch,
      rawDowIndex: [...raw.dowIndex], tunedDowIndex, confidence,
      bestDay, worstDay, weekendBias, effectStrength,
    };
  }

  return profiles;
}

// ── Tuned saturation model builder ────────────────────────────────────────────

function buildTunedSaturationModels(
  rawModels: SaturationModel[],
  channelProfiles: Record<string, TunedChannelProfile>,
): SaturationModel[] {
  return rawModels.map(m => ({
    ...m,
    alpha: channelProfiles[m.channel]?.tunedAlpha ?? m.alpha,
  }));
}

// ── Period weight computation (using tuned indices) ───────────────────────────

/**
 * Replicates getPeriodTimeWeightSums but with tuned seasonality and dow indices.
 *
 * Returns Σ_month (tunedSeasonality[month] × tunedDowBlend[month]) per channel,
 * used as the multiplier vector for the optimizer objective.
 */
export function computeTunedPeriodWeights(
  seasonalityProfiles: Record<string, TunedSeasonalityProfile>,
  dowProfiles: Record<string, TunedDowProfile>,
  selectedMonths: MonthPoint[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const seaIdx = seasonalityProfiles[ch]?.tunedMonthlyIndex ?? Array(12).fill(1);
    const dowIdx = dowProfiles[ch]?.tunedDowIndex ?? Array(7).fill(1);
    let sum = 0;
    for (const mp of selectedMonths) {
      const seasonMult = seaIdx[mp.month] ?? 1;
      const monthDist  = getMonthDayDistribution(mp.year, mp.month);
      const dowBlend   = monthDist.reduce((acc, ratio, d) => acc + ratio * (dowIdx[d] ?? 1), 0) || 1;
      sum += seasonMult * dowBlend;
    }
    result[ch] = selectedMonths.length === 0 ? 1 : sum;
  }
  return result;
}

// ── Bounded allocation projection (mirrors internal calculations.ts logic) ────

/**
 * Projects raw allocation fractions onto the simplex while respecting
 * per-channel min/max bounds.  Mirrors the internal projectOntoSimplexWithVariableBounds
 * function from calculations.ts (which is not exported).
 *
 * Iterates: clip each channel to [lo, hi_ch], renormalize, repeat until stable.
 */
function projectOntoSimplex(
  raw: Record<string, number>,
  lo: number,
  maxByChannel: Record<string, number>,
): Record<string, number> {
  const x: Record<string, number> = {};
  let s = 0;
  CHANNELS.forEach(ch => { x[ch] = Math.max(0, raw[ch] || 0); s += x[ch]; });
  if (s <= 0) CHANNELS.forEach(ch => (x[ch] = 1 / CHANNELS.length));
  else        CHANNELS.forEach(ch => (x[ch] /= s));

  for (let iter = 0; iter < 48; iter++) {
    CHANNELS.forEach(ch => {
      const hi = maxByChannel[ch] ?? 0.35;
      x[ch] = Math.min(hi, Math.max(lo, x[ch]));
    });
    const tot = CHANNELS.reduce((a, ch) => a + x[ch], 0);
    if (tot <= 0) break;
    CHANNELS.forEach(ch => (x[ch] /= tot));
  }
  return x;
}

// ── Tuned optimal allocation ───────────────────────────────────────────────────

/**
 * Computes the recommended allocation using tuned models and tuned period weights.
 *
 * Steps:
 *   1. Run Lagrange multiplier optimizer with tunedModels + tunedPeriodWeights
 *   2. Apply channel max-share bounds (same logic as getOptimalSharesForPeriod)
 */
export function computeTunedOptimalShares(
  tunedModels: SaturationModel[],
  monthlyBudget: number,
  tunedPeriodWeights: Record<string, number>,
  channelProfiles: Record<string, TunedChannelProfile>,
  maxChannelShare = 0.35,
  minChannelShare = 0.01,
): Record<string, number> {
  const rawFractions = getOptimalAllocationNonLinear(
    tunedModels,
    monthlyBudget,
    new Set(),
    tunedPeriodWeights,
  );

  // Per-channel max-share adjusted by data quality (same heuristic as getOptimalSharesForPeriod)
  const maxByChannel: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    const n = channelProfiles[ch]?.rawMonthCount ?? 0;
    let hi = maxChannelShare;
    if (n < 4) hi = Math.min(hi, 0.18);
    else if (n < 8) hi = Math.min(hi, 0.28);
    maxByChannel[ch] = hi;
  });

  return projectOntoSimplex(rawFractions, minChannelShare, maxByChannel);
}

// ── Recommendation stabilization (inertia) ────────────────────────────────────

/**
 * Blends the raw-optimal allocation toward the historical allocation to prevent
 * aggressive reallocation from weak or uncertain evidence.
 *
 * The inertia weight increases when:
 *   - Portfolio average confidence is low
 *   - Recommended change is large and not strongly supported
 *
 * After blending, per-channel changes are further capped at maxDelta
 * (which scales with channel-level confidence).
 */
export function stabilizeRecommendedAllocation(
  rawOptimal: Record<string, number>,
  historicalFractions: Record<string, number>,
  channelProfiles: Record<string, TunedChannelProfile>,
): Record<string, number> {
  const cfg = CALIBRATION_CONFIG.recommendation;

  // Portfolio average confidence drives the global inertia level
  const avgConf = CHANNELS.reduce((s, ch) => s + (channelProfiles[ch]?.efficiencyConfidence ?? 0.5), 0) / CHANNELS.length;
  const totalInertia = Math.min(
    cfg.inertiaBase + cfg.inertiaLowConfBoost,
    cfg.inertiaBase + cfg.inertiaLowConfBoost * (1 - avgConf),
  );

  const blended: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const raw  = rawOptimal[ch] || 0;
    const hist = historicalFractions[ch] || (1 / CHANNELS.length);
    const conf = channelProfiles[ch]?.efficiencyConfidence ?? 0.5;

    // Global inertia blend
    const globalBlend = (1 - totalInertia) * raw + totalInertia * hist;

    // Per-channel max delta cap: low-confidence channels can only shift by ~5pp,
    // high-confidence channels by up to 18pp
    const maxDelta = cfg.maxDeltaFloor + (cfg.maxDeltaCeiling - cfg.maxDeltaFloor) * conf;
    const delta     = globalBlend - hist;
    const cappedDelta = Math.sign(delta) * Math.min(Math.abs(delta), maxDelta);

    blended[ch] = Math.max(0.01, hist + cappedDelta);
  }

  // Final normalization so shares sum to exactly 1.0
  const total = Object.values(blended).reduce((s, v) => s + v, 0);
  CHANNELS.forEach(ch => (blended[ch] /= total));

  return blended;
}

// ── Uplift confidence classification ─────────────────────────────────────────

/**
 * Classifies the uplift into a confidence tier based on data quality signals.
 *
 * 'high'        — consistent historical patterns, meaningful uplift, several strong-signal channels
 * 'moderate'    — directionally supported, but magnitude may vary
 * 'exploratory' — limited data or high variance; treat as indicative only
 */
export function classifyUpliftConfidence(
  upliftPct: number,
  portfolioAvgConfidence: number,
  topRecommendations: { reasonCodes: string[] }[],
): UpliftConfidence {
  const cfg = CALIBRATION_CONFIG.uplift;

  // Count recommendations backed by strong model signals
  const strongSignalKeywords = ['High base efficiency', 'Marginal returns below breakeven', 'Marginal returns weakening'];
  const strongChannelCount = topRecommendations.filter(r =>
    r.reasonCodes.some(code => strongSignalKeywords.some(kw => code.includes(kw))),
  ).length;

  if (
    portfolioAvgConfidence >= cfg.highConfidenceThreshold &&
    upliftPct >= cfg.highUpliftPctThreshold &&
    strongChannelCount >= cfg.highStrongChannels
  ) {
    return {
      tier: 'high',
      note: 'Multiple channels show consistent efficiency signals backed by stable historical patterns. This recommendation has strong model support.',
    };
  }

  if (
    portfolioAvgConfidence >= cfg.moderateConfidenceThreshold &&
    upliftPct >= cfg.moderateUpliftPctThreshold
  ) {
    return {
      tier: 'moderate',
      note: 'The reallocation direction is supported by historical data. The exact uplift magnitude may vary with real-world execution and market conditions.',
    };
  }

  return {
    tier: 'exploratory',
    note: 'Limited data depth or high channel volatility reduces confidence in this specific uplift estimate. Use as directional guidance, not a precise forecast.',
  };
}

// ── Main calibration entry point ──────────────────────────────────────────────

/**
 * Run the full calibration pass on the aggregated historical state.
 * Returns a CalibrationOutput that is stable as long as sourceData does not change.
 * Dynamic computations (period weights, optimal shares) are separate exported functions.
 */
export function calibrate(
  state: AggregatedState,
  rawModels: SaturationModel[],
  rawSeasonality: SeasonalityMetrics[],
  rawDow: DayOfWeekMetrics[],
): CalibrationOutput {
  const channelProfiles    = calibrateChannelProfiles(state, rawModels);
  const seasonalityProfiles = calibrateSeasonality(state, rawSeasonality);
  const dowProfiles         = calibrateDow(state, rawDow);
  const tunedModels         = buildTunedSaturationModels(rawModels, channelProfiles);

  // Portfolio-level summary metrics
  const tunedRoasValues = CHANNELS.map(ch => channelProfiles[ch]?.tunedROAS || 0).filter(r => r > 0);
  tunedRoasValues.sort((a, b) => a - b);
  const portfolioMedianROAS = tunedRoasValues[Math.floor(tunedRoasValues.length / 2)] || 1;

  const portfolioAvgConfidence =
    CHANNELS.reduce((s, ch) => s + (channelProfiles[ch]?.efficiencyConfidence ?? 0.5), 0) / CHANNELS.length;

  return {
    channelProfiles,
    seasonalityProfiles,
    dowProfiles,
    tunedModels,
    portfolioMedianROAS,
    portfolioAvgConfidence,
  };
}

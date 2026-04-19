/**
 * optimizerTypes.ts
 *
 * All output types for the Mix Optimiser calculation backbone.
 * These are populated by useOptimizerModel and consumed by the 5 optimizer pages.
 *
 * State layers:
 *   A. Input state        — lives in OptimizerContext
 *   B. Historical model   — derived once from raw data
 *   C. Current plan       — MixPlanSummary with label 'current'
 *   D. Optimized plan     — MixPlanSummary with label 'optimized'
 *   E. Diagnosis          — derived from current plan vs historical
 *   F. Recommendations    — derived from current vs optimized
 *   G. Uplift             — computed ONLY from C vs D
 *   H. Explanation        — why-it-works metadata
 *   I. Scenarios          — budget sensitivity, runs same model at different budget levels
 */

import type { MonthPoint, MixChannelEfficiency } from './calculations';
import type { CalibrationOutput, UpliftConfidence } from './optimizerCalibration';
import type { PlanningMode, PlanningPeriod } from '@/contexts/OptimizerContext';

// ── Per-channel forecast row (inside a plan) ─────────────────────────────────

export interface ChannelForecastRow {
  channel: string;
  /** Allocation fraction as a percentage, e.g. 12.3 */
  allocationPct: number;
  /** Average monthly spend over the planning period */
  spend: number;
  /** Total spend across the planning period */
  periodSpend: number;
  /** Average monthly revenue forecast */
  revenue: number;
  /** Total revenue forecast across the planning period */
  periodRevenue: number;
  /** Revenue ÷ spend for this channel in this plan */
  roas: number;
  /** Concave-model marginal ROAS at this spend level */
  marginalROAS: number;
  /** Seasonality index for the representative month */
  seasonalityMultiplier: number;
  /** Day-of-week blend for the representative month */
  dowMultiplier: number;
  /** True when spend ≥ historical saturation cap */
  isCapped: boolean;
  /** Monthly spend at which ROAS decline is historically observed */
  capSpend: number;
}

// ── Plan summary (current or optimized) ─────────────────────────────────────

export interface MixPlanSummary {
  /** 'current' = user's manual allocation; 'optimized' = model recommendation */
  label: 'current' | 'optimized';
  /** Normalised allocation fractions (sum = 1) */
  allocationShares: Record<string, number>;
  /** Per-channel forecast rows, keyed by channel name */
  channels: Record<string, ChannelForecastRow>;
  totalPeriodSpend: number;
  totalPeriodRevenue: number;
  blendedROAS: number;
}

// ── Diagnosis (current state vs historical benchmark) ────────────────────────

export interface ChannelDiagnosis {
  channel: string;
  status: MixChannelEfficiency;
  isFlagged: boolean;
  /** Current allocation % */
  currentPct: number;
  /** Historical average allocation % */
  historicalPct: number;
  /** currentPct − historicalPct (positive = over-weighted) */
  deltaPct: number;
  historicalROAS: number;
  portfolioROAS: number;
  /** Current monthly spend implied by currentPct and budget */
  currentSpend: number;
  /** Lower monthly spend bound of the efficient range */
  lowerEfficientSpend: number;
  /** Upper monthly spend bound of the efficient range */
  upperEfficientSpend: number;
  /** Monthly spend where marginal ROAS reaches breakeven (~1.0x) */
  saturationSpend: number;
  marginalROAS: number;
  isSaturated: boolean;
  /** Receiving noticeably more budget than historical baseline */
  isOverWeighted: boolean;
  /** Receiving noticeably less budget than historical baseline */
  isUnderWeighted: boolean;
  /** Short reason code, e.g. "Marginal returns below breakeven" */
  reasonCode: string;
  /** 1–2 sentence plain-English description of the diagnosis */
  explanation: string;
}

// ── Channel recommendation (current → optimized delta) ───────────────────────

export interface ChannelRecommendation {
  channel: string;
  currentPct: number;
  recommendedPct: number;
  /** recommendedPct − currentPct */
  deltaPct: number;
  direction: 'increase' | 'decrease' | 'hold';
  /** The most important reason code */
  primaryReasonCode: string;
  /** All applicable reason codes, e.g. ['High base efficiency', 'Seasonal advantage'] */
  reasonCodes: string[];
  /** 1–2 sentence plain-English explanation */
  explanation: string;
}

// ── Uplift summary ───────────────────────────────────────────────────────────

export interface UpliftSummary {
  /** optimizedRevenue − currentRevenue (can be negative) */
  revenueOpportunity: number;
  upliftPct: number;
  /** True when gap is within model tolerance (~0.3%) */
  isNearOptimal: boolean;
  currentROAS: number;
  recommendedROAS: number;
  roasImprovement: number;
  topIncreases: ChannelRecommendation[];
  topReductions: ChannelRecommendation[];
  /** Model confidence tier for this uplift estimate */
  upliftConfidence: UpliftConfidence;
}

// ── Why-It-Works explanation layer ───────────────────────────────────────────

export interface ChannelExplanation {
  channel: string;
  // ── Efficiency ────────────────────────────────────────────────────────────
  /** Raw historical ROAS (total revenue ÷ total spend, no outlier handling) */
  rawROAS: number;
  /** Spend-weighted, winsorized ROAS used by the model */
  tunedROAS: number;
  historicalROAS: number;  // alias for tunedROAS, kept for page compatibility
  portfolioROAS: number;
  /** Data quality / stability score 0–1 */
  efficiencyConfidence: number;
  stabilityScore: number;
  volatilityScore: number;
  isHighVolatility: boolean;
  // ── Saturation ────────────────────────────────────────────────────────────
  /** Spend vs ROAS scatter points from historical data (for diminishing returns chart) */
  saturationCurve: { spend: number; roas: number }[];
  capSpend: number;
  capReason: string;
  isSaturated: boolean;
  marginalROASAtCurrent: number;
  marginalROASAtRecommended: number;
  // ── Seasonality ───────────────────────────────────────────────────────────
  peakMonth: number;
  peakBoost: number;
  /** Tuned 12-element seasonality index */
  seasonalityIndex: number[];
  /** Raw 12-element seasonality index (for comparison) */
  rawSeasonalityIndex: number[];
  seasonalityStrength: 'strong' | 'moderate' | 'weak';
  // ── Day-of-week ───────────────────────────────────────────────────────────
  bestDay: number;
  worstDay: number;
  /** Tuned 7-element DOW index */
  dowIndex: number[];
  /** Raw 7-element DOW index (for comparison) */
  rawDowIndex: number[];
  weekendBias: 'weekday' | 'weekend' | 'neutral';
  dowEffectStrength: 'strong' | 'moderate' | 'weak';
  // ── Reason codes ─────────────────────────────────────────────────────────
  reasonCodes: string[];
}

// Re-export calibration types so pages can import from a single place
export type { CalibrationOutput, UpliftConfidence } from './optimizerCalibration';

// ── Full model output ────────────────────────────────────────────────────────

export interface OptimizerModelOutput {
  // ── Meta ───────────────────────────────────────────────────────────────────
  isLoading: boolean;
  dataSource: string;
  dataUpdatedAt: number | undefined;
  dataRange: { min: string; max: string } | null;
  totalHistoricalMonths: number;

  // ── Planning metadata (mirrors OptimizerContext master inputs) ─────────────
  selectedRange: MonthPoint[];
  durationMonths: number;
  planningMode: PlanningMode;
  planningPeriod: PlanningPeriod;
  monthlyBudget: number;
  totalPeriodBudget: number;
  modeMultiplier: number;

  // ── Historical benchmarks ──────────────────────────────────────────────────
  historicalFractions: Record<string, number>;
  portfolioROAS: number;

  // ── Layer C: Current plan (user's manual allocation) ──────────────────────
  currentPlan: MixPlanSummary;

  // ── Layer D: Optimized plan (model's recommendation) ──────────────────────
  optimizedPlan: MixPlanSummary;

  // ── Layer E: Diagnosis (from current plan, NOT optimized) ─────────────────
  diagnosis: Record<string, ChannelDiagnosis>;
  flaggedChannels: string[];
  overWeightedChannels: string[];
  underWeightedChannels: string[];

  // ── Layer F/G: Recommendations + Uplift ───────────────────────────────────
  uplift: UpliftSummary;
  recommendations: Record<string, ChannelRecommendation>;

  // ── Layer H: Explanation (for Why It Works) ────────────────────────────────
  explanation: Record<string, ChannelExplanation>;

  // ── Debug / Explainability layer (for audit + future UI) ──────────────────
  debug: {
    /** Full calibration output: raw vs tuned per channel, confidence scores, etc. */
    calibration: CalibrationOutput;
    /** Tuned period time-weight sums (seasonality × dow blend per channel for selected range) */
    tunedPeriodWeights: Record<string, number>;
    /** Raw period time-weight sums (before calibration) */
    rawPeriodWeights: Record<string, number>;
    /** Portfolio average efficiency confidence 0–1 */
    portfolioAvgConfidence: number;
    /** Shared channel baselines — the single source of truth consumed by every page. */
    baselines: import('./calculations').ChannelBaseline[];
    /** Per-channel data-quality audit (gaps, outliers, partial months). */
    auditReport: import('./dataQuality').DataQualityReport | null;
  };
}

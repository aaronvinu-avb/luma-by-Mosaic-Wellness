import { CHANNELS } from '@/lib/mockData';

export const DAYS_PER_MONTH = 365.25 / 12;

/** Flag only if daily spend is nearly constant. Paid channels with 2×+ range must not flag. */
export const LIMITED_DATA_CV_THRESHOLD = 0.12;
export const LIMITED_DATA_MIN_UNIQUE_LEVELS = 20;
export const LIMITED_DATA_P95_P5_THRESHOLD = 1.5;

export const EMAIL_MONTHLY_CAP = 1_500_000;
export const SMS_MONTHLY_CAP = 1_200_000;

export interface FittedCurve {
  form: 'log';
  /** Daily log-curve: revenue = a · ln(1 + spend/b) */
  a: number;
  b: number;
  vmax: number;
  k: number;
  n: number;
  limitedData: boolean;
  limitedJustification: string | null;
  dataCapMonthly: number | null;
  spendCV: number;
  uniqueSpendLevels: number;
  p95p5Ratio: number;
  r2: number;
  daysPerMonth: number;
  meanDailySpend: number;
  historicalROAS: number;
}

type CurveChannel = { channel: string; curve: FittedCurve; historicalAllocationPct?: number };

export function operationalCapForChannel(channel: string): number {
  if (channel === 'Email') return EMAIL_MONTHLY_CAP;
  if (channel === 'SMS') return SMS_MONTHLY_CAP;
  return Number.POSITIVE_INFINITY;
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

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = (sortedAsc.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (i - lo);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function dailyLogRevenue(curve: FittedCurve, dailySpend: number): number {
  if (dailySpend <= 0 || !(curve.a > 0) || !(curve.b > 0)) return 0;
  return curve.a * Math.log(1 + dailySpend / curve.b);
}

export function dailyLogMarginal(curve: FittedCurve, dailySpend: number): number {
  if (!(curve.a > 0) || !(curve.b > 0)) return 0;
  return curve.a / (curve.b + Math.max(0, dailySpend));
}

export function monthlyCurveRevenue(curve: FittedCurve, monthlySpend: number): number {
  const d = curve.daysPerMonth > 0 ? curve.daysPerMonth : DAYS_PER_MONTH;
  return d * dailyLogRevenue(curve, monthlySpend / d);
}

export function monthlyCurveMarginal(curve: FittedCurve, monthlySpend: number): number {
  const d = curve.daysPerMonth > 0 ? curve.daysPerMonth : DAYS_PER_MONTH;
  return dailyLogMarginal(curve, monthlySpend / d);
}

function assertConcaveAt(curve: FittedCurve, dailySpend: number): boolean {
  if (dailySpend <= 1e-6) return true;
  const avg = dailyLogRevenue(curve, dailySpend) / dailySpend;
  const marg = dailyLogMarginal(curve, dailySpend);
  return marg <= avg + 1e-9;
}

interface Bin {
  spend: number;
  revenue: number;
  n: number;
}

export function binDailySpend(points: Array<{ spend: number; revenue: number }>, binCount = 12): Bin[] {
  const clean = points
    .filter(p => Number.isFinite(p.spend) && Number.isFinite(p.revenue) && p.spend > 0 && p.revenue >= 0)
    .sort((a, b) => a.spend - b.spend);
  if (clean.length === 0) return [];
  const bins: Bin[] = [];
  const count = Math.min(binCount, clean.length);
  for (let i = 0; i < count; i += 1) {
    const lo = Math.floor((i * clean.length) / count);
    const hi = Math.floor(((i + 1) * clean.length) / count);
    const slice = clean.slice(lo, hi);
    if (slice.length === 0) continue;
    bins.push({
      spend: mean(slice.map(p => p.spend)),
      revenue: mean(slice.map(p => p.revenue)),
      n: slice.length,
    });
  }
  return bins;
}

export function diagnoseSpendVariance(dailySpends: number[]): {
  spendCV: number;
  uniqueSpendLevels: number;
  p95p5Ratio: number;
  limitedData: boolean;
  limitedJustification: string | null;
} {
  const positive = dailySpends.filter(s => s > 0);
  if (positive.length < 8) {
    return {
      spendCV: 0,
      uniqueSpendLevels: positive.length,
      p95p5Ratio: 1,
      limitedData: true,
      limitedJustification: `Only ${positive.length} positive-spend days (need ≥8). Fallback log curve anchored at observed avg ROAS.`,
    };
  }
  const m = mean(positive);
  const spendCV = m > 0 ? stdev(positive) / m : 0;
  const uniqueSpendLevels = new Set(positive.map(s => Math.round(s / 100) * 100)).size;
  const sorted = [...positive].sort((a, b) => a - b);
  const p5 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);
  const p95p5Ratio = p5 > 0 ? p95 / p5 : Number.POSITIVE_INFINITY;

  // Near-constant spend only. A 2×+ daily range (typical paid media) must not flag.
  const limitedData =
    spendCV < LIMITED_DATA_CV_THRESHOLD &&
    uniqueSpendLevels < LIMITED_DATA_MIN_UNIQUE_LEVELS &&
    p95p5Ratio < LIMITED_DATA_P95_P5_THRESHOLD;

  return {
    spendCV,
    uniqueSpendLevels,
    p95p5Ratio,
    limitedData,
    limitedJustification: limitedData
      ? `Daily spend nearly constant (CV ${(spendCV * 100).toFixed(1)}%, p95/p5=${p95p5Ratio.toFixed(2)}, ${uniqueSpendLevels} distinct ₹100 levels). Fallback log curve anchored at avg ROAS so marginal < average immediately.`
      : null,
  };
}

function makeLogCurve(
  a: number,
  b: number,
  extras: Partial<FittedCurve> & Pick<FittedCurve, 'daysPerMonth' | 'meanDailySpend' | 'historicalROAS' | 'spendCV' | 'uniqueSpendLevels' | 'p95p5Ratio' | 'limitedData' | 'limitedJustification' | 'r2'>,
): FittedCurve {
  return {
    form: 'log',
    a,
    b,
    vmax: a,
    k: b,
    n: 1,
    dataCapMonthly: null,
    ...extras,
  };
}

function fitLogOnBins(
  bins: Bin[],
  meanS: number,
  meanR: number,
): { a: number; b: number; r2: number } | null {
  if (bins.length < 3 || !(meanS > 0) || !(meanR > 0)) return null;
  const maxS = Math.max(...bins.map(x => x.spend), meanS);
  const bGrid: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    const t = i / 23;
    bGrid.push(Math.exp(Math.log(0.08 * meanS) + t * (Math.log(4 * maxS) - Math.log(0.08 * meanS))));
  }

  const wsum = bins.reduce((s, x) => s + x.n, 0);
  const meanRev = bins.reduce((s, x) => s + x.revenue * x.n, 0) / wsum;
  const ssTot = bins.reduce((s, x) => s + x.n * (x.revenue - meanRev) ** 2, 0);

  let best: { a: number; b: number; sse: number; r2: number } | null = null;
  for (const b of bGrid) {
    if (!(b > 0)) continue;
    const a = meanR / Math.log(1 + meanS / b);
    if (!(a > 0) || !Number.isFinite(a)) continue;
    const histAvg = meanR / meanS;
    if (a / (b + meanS) > histAvg + 1e-6) continue;
    let sse = 0;
    let concave = true;
    for (const bin of bins) {
      const pred = a * Math.log(1 + bin.spend / b);
      sse += bin.n * (bin.revenue - pred) ** 2;
      const avg = pred / bin.spend;
      const marg = a / (b + bin.spend);
      if (marg > avg + 1e-8) concave = false;
    }
    if (!concave) continue;
    const r2 = ssTot > 0 ? 1 - sse / ssTot : 0;
    if (!best || sse < best.sse) best = { a, b, sse, r2 };
  }
  if (!best) return null;
  return { a: best.a, b: best.b, r2: best.r2 };
}

function anchoredFallback(meanS: number, historicalROAS: number): { a: number; b: number } {
  const b = Math.max(meanS, 1);
  const meanR = Math.max(0, historicalROAS) * meanS;
  const a = meanR / Math.log(2);
  return { a: a > 0 ? a : 1, b };
}

export function fitChannelResponseCurve(
  dailyPoints: Array<{ spend: number; revenue: number }>,
  _monthlySpends: number[],
  historicalROAS: number,
  daysPerMonth: number,
): FittedCurve {
  void _monthlySpends;
  const clean = dailyPoints.filter(p => p.spend > 0 && Number.isFinite(p.spend) && Number.isFinite(p.revenue));
  const spends = clean.map(p => p.spend);
  const meanS = mean(spends);
  const meanR = mean(clean.map(p => p.revenue));
  const diag = diagnoseSpendVariance(spends);
  const baseMeta = {
    daysPerMonth,
    meanDailySpend: meanS,
    historicalROAS,
    spendCV: diag.spendCV,
    uniqueSpendLevels: diag.uniqueSpendLevels,
    p95p5Ratio: diag.p95p5Ratio,
    limitedData: diag.limitedData,
    limitedJustification: diag.limitedJustification,
    r2: 0,
  };

  const apply = (a: number, b: number, r2: number, limited: boolean, justification: string | null): FittedCurve => {
    const curve = makeLogCurve(a, b, { ...baseMeta, r2, limitedData: limited, limitedJustification: justification });
    const probe = [meanS * 0.25, meanS, meanS * 2, meanS * 4].filter(s => s > 0);
    const ok = probe.every(s => assertConcaveAt(curve, s));
    if (!ok) {
      console.warn(`[mix] convex log fit rejected; using anchored concave default (mean daily spend ₹${meanS.toFixed(0)})`);
      const fb = anchoredFallback(meanS || 1, historicalROAS);
      return makeLogCurve(fb.a, fb.b, {
        ...baseMeta,
        r2: 0,
        limitedData: true,
        limitedJustification: 'Unconstrained fit failed concavity check. Anchored log curve at historical avg ROAS.',
      });
    }
    return curve;
  };

  if (diag.limitedData || clean.length < 8 || !(meanS > 0) || !(meanR > 0)) {
    const fb = anchoredFallback(meanS || 1, historicalROAS);
    return apply(fb.a, fb.b, 0, true, diag.limitedJustification ?? 'Insufficient daily points for a spend-response fit.');
  }

  const bins = binDailySpend(clean, 12);
  const fitted = fitLogOnBins(bins, meanS, meanR);
  if (!fitted) {
    const fb = anchoredFallback(meanS, historicalROAS);
    return apply(fb.a, fb.b, 0, false, null);
  }
  return apply(fitted.a, fitted.b, fitted.r2, false, null);
}

export function channelSpendCeiling(
  channel: string,
  _curve: FittedCurve,
  _historicalAllocationPct: number,
  _operationalCaps: Record<string, number>,
  budget: number,
): number {
  void _curve;
  void _historicalAllocationPct;
  void _operationalCaps;
  const cap = operationalCapForChannel(channel);
  if (Number.isFinite(cap)) return Math.min(cap, Math.max(0, budget));
  return Math.max(0, budget);
}

export function buildChannelCaps(
  _baselines: CurveChannel[],
  _operationalCaps: Record<string, number>,
  budget: number,
): Record<string, number> {
  void _baselines;
  void _operationalCaps;
  const caps: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    caps[ch] = channelSpendCeiling(ch, {} as FittedCurve, 0, {}, budget);
  });
  return caps;
}

/**
 * KKT water-fill for log curves: a/(b + s) = λ, s = a/λ − b (daily),
 * then clamp to [0, cap]. Binary-search λ so monthly spends sum to budget.
 */
export function allocateBudgetByMarginalRoas(
  budget: number,
  baselines: CurveChannel[],
  caps: Record<string, number>,
): Record<string, number> {
  const alloc: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    alloc[ch] = 0;
  });
  const safeBudget = Math.max(0, budget);
  if (safeBudget <= 0) return alloc;

  const byCh = Object.fromEntries(baselines.map(b => [b.channel, b])) as Record<string, CurveChannel>;
  const hiBound = (ch: string) => Math.max(0, caps[ch] ?? 0);

  const spendAtLambda = (lambda: number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const ch of CHANNELS) {
      const b = byCh[ch];
      const cap = hiBound(ch);
      if (!b || !(b.curve.a > 0) || !(b.curve.b > 0) || lambda <= 0) {
        out[ch] = 0;
        continue;
      }
      const d = b.curve.daysPerMonth > 0 ? b.curve.daysPerMonth : DAYS_PER_MONTH;
      const daily = b.curve.a / lambda - b.curve.b;
      out[ch] = clamp(daily * d, 0, cap);
    }
    return out;
  };

  let lo = 1e-8;
  let hi = 1e-8;
  for (const ch of CHANNELS) {
    const b = byCh[ch];
    if (!b) continue;
    const m0 = monthlyCurveMarginal(b.curve, 0);
    if (m0 > hi) hi = m0;
  }
  hi = Math.max(hi * 1.05, 1);

  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const trial = spendAtLambda(mid);
    const sum = CHANNELS.reduce((s, ch) => s + trial[ch], 0);
    if (sum > safeBudget) lo = mid;
    else hi = mid;
  }

  const next = spendAtLambda(hi);
  CHANNELS.forEach(ch => {
    alloc[ch] = clamp(next[ch], 0, hiBound(ch));
  });
  let used = CHANNELS.reduce((s, ch) => s + alloc[ch], 0);
  let leftover = safeBudget - used;
  if (leftover > 1) {
    const room = CHANNELS.filter(ch => alloc[ch] + 1 < hiBound(ch) && byCh[ch]).sort(
      (a, b) => monthlyCurveMarginal(byCh[b]!.curve, alloc[b]) - monthlyCurveMarginal(byCh[a]!.curve, alloc[a]),
    );
    for (const ch of room) {
      if (leftover <= 1) break;
      const take = Math.min(leftover, hiBound(ch) - alloc[ch]);
      alloc[ch] += take;
      leftover -= take;
    }
  } else if (leftover < -1) {
    const scale = safeBudget / Math.max(used, 1e-9);
    CHANNELS.forEach(ch => {
      alloc[ch] *= scale;
    });
  }

  used = CHANNELS.reduce((s, ch) => s + alloc[ch], 0);
  const drift = safeBudget - used;
  if (Math.abs(drift) > 0.5) {
    const host = CHANNELS.filter(ch => {
      if (drift > 0) return hiBound(ch) - alloc[ch] > 1;
      return alloc[ch] > 1;
    })[0];
    if (host) {
      alloc[host] = clamp(alloc[host] + drift, 0, hiBound(host));
    }
  }

  return alloc;
}

export function clipAndRefillByMarginalRoas(
  seedSpend: Record<string, number>,
  budget: number,
  baselines: CurveChannel[],
  operationalCaps: Record<string, number>,
): Record<string, number> {
  const caps = buildChannelCaps(baselines, operationalCaps, budget);
  const byCh = Object.fromEntries(baselines.map(b => [b.channel, b])) as Record<string, CurveChannel>;
  const alloc: Record<string, number> = {};
  CHANNELS.forEach(ch => {
    alloc[ch] = clamp(seedSpend[ch] || 0, 0, caps[ch] || 0);
  });
  let leftover = budget - CHANNELS.reduce((s, ch) => s + alloc[ch], 0);
  const step = 10_000;
  let guard = 0;
  while (leftover >= step && guard++ < 20_000) {
    let best = '';
    let bestM = Number.NEGATIVE_INFINITY;
    for (const ch of CHANNELS) {
      const room = (caps[ch] || 0) - alloc[ch];
      if (room < step * 0.5 || !byCh[ch]) continue;
      const m = monthlyCurveMarginal(byCh[ch].curve, alloc[ch] + step);
      if (m > bestM) {
        bestM = m;
        best = ch;
      }
    }
    if (!best) break;
    const take = Math.min(step, leftover, (caps[best] || 0) - alloc[best]);
    alloc[best] += take;
    leftover -= take;
  }
  if (leftover > 1) {
    const open = CHANNELS.filter(ch => (caps[ch] || 0) - alloc[ch] > 1);
    for (const ch of open) {
      if (leftover <= 1) break;
      const take = Math.min(leftover, (caps[ch] || 0) - alloc[ch]);
      alloc[ch] += take;
      leftover -= take;
    }
  }
  return alloc;
}

export interface MixCheck {
  ok: boolean;
  detail: string;
}

export interface MixValidationReport {
  checks: {
    marginalLeCurveAvg: MixCheck;
    realizedBetween: MixCheck;
    spendSumsToBudget: MixCheck;
    emailSmsCaps: MixCheck;
    noLeakedCaps: MixCheck;
    waterFillConvergence: MixCheck;
    blendedMatches: MixCheck;
    limitedDataCount: MixCheck;
    histPointConcave: MixCheck;
  };
  lambda: number | null;
  flagged: Array<{ channel: string; spendCV: number; uniqueSpendLevels: number; p95p5Ratio: number; justification: string }>;
  diagnostics: Array<{
    channel: string;
    spendCV: number;
    uniqueSpendLevels: number;
    p95p5Ratio: number;
    limitedData: boolean;
  }>;
  allPassed: boolean;
}

export function validateRecommendedAllocation(
  budget: number,
  baselines: CurveChannel[],
  forecast: {
    channels: Record<string, {
      forecastSpend: number;
      forecastRevenue: number;
      forecastROAS: number;
      historicalROAS: number;
      marginalROAS: number;
      limitedData: boolean;
    }>;
    totalSpend: number;
    totalRevenue: number;
    blendedROAS: number;
  },
): MixValidationReport {
  const fail = (detail: string): MixCheck => ({ ok: false, detail });
  const pass = (detail: string): MixCheck => ({ ok: true, detail });

  const byCh = Object.fromEntries(baselines.map(b => [b.channel, b]));
  const diagnostics = CHANNELS.map(ch => {
    const c = byCh[ch]?.curve;
    return {
      channel: ch,
      spendCV: c?.spendCV ?? 0,
      uniqueSpendLevels: c?.uniqueSpendLevels ?? 0,
      p95p5Ratio: c?.p95p5Ratio ?? 0,
      limitedData: c?.limitedData ?? false,
    };
  });
  const flagged = CHANNELS.filter(ch => byCh[ch]?.curve.limitedData).map(ch => {
    const c = byCh[ch]!.curve;
    return {
      channel: ch,
      spendCV: c.spendCV,
      uniqueSpendLevels: c.uniqueSpendLevels,
      p95p5Ratio: c.p95p5Ratio,
      justification: c.limitedJustification || 'limited data',
    };
  });

  const margFails: string[] = [];
  const sandwichFails: string[] = [];
  CHANNELS.forEach(ch => {
    const row = forecast.channels[ch];
    if (!row || row.forecastSpend <= 1) return;
    const realized = row.forecastSpend > 0 ? row.forecastRevenue / row.forecastSpend : 0;
    if (row.marginalROAS > realized + 0.02) {
      margFails.push(`${ch}: marg ${row.marginalROAS.toFixed(3)}x > realized ${realized.toFixed(3)}x`);
    }
    const histMonthly = (byCh[ch]?.curve.meanDailySpend ?? 0) * (byCh[ch]?.curve.daysPerMonth || DAYS_PER_MONTH);
    const atOrAboveHist = row.forecastSpend + 1 >= histMonthly && histMonthly > 0;
    const upper = atOrAboveHist ? row.historicalROAS : realized;
    if (!(row.marginalROAS - 0.02 <= realized && realized <= upper + 0.05)) {
      sandwichFails.push(
        `${ch}: realized ${realized.toFixed(2)}x not between m ${row.marginalROAS.toFixed(2)}x and avg ${row.historicalROAS.toFixed(2)}x`,
      );
    }
  });

  const spendSum = CHANNELS.reduce((s, ch) => s + (forecast.channels[ch]?.forecastSpend ?? 0), 0);
  const email = forecast.channels.Email?.forecastSpend ?? 0;
  const sms = forecast.channels.SMS?.forecastSpend ?? 0;

  const leaked: string[] = [];
  CHANNELS.forEach(ch => {
    if (ch === 'Email' || ch === 'SMS') return;
    const s = forecast.channels[ch]?.forecastSpend ?? 0;
    if (Math.abs(s - EMAIL_MONTHLY_CAP) < 1 || Math.abs(s - SMS_MONTHLY_CAP) < 1) {
      leaked.push(`${ch}=₹${s.toFixed(0)}`);
    }
  });

  const lambdaCandidates: number[] = [];
  CHANNELS.forEach(ch => {
    const row = forecast.channels[ch];
    const spend = row?.forecastSpend ?? 0;
    const cap = operationalCapForChannel(ch);
    const atCap = Number.isFinite(cap) && spend >= cap - 500;
    const atZero = spend < 500;
    if (!atCap && !atZero) {
      lambdaCandidates.push(row.marginalROAS);
    }
  });
  const lambda = lambdaCandidates.length ? mean(lambdaCandidates) : null;
  let convOk = true;
  let convDetail = 'no interior channels';
  if (lambda != null && lambdaCandidates.length >= 2) {
    const maxD = Math.max(...lambdaCandidates.map(v => Math.abs(v - lambda) / lambda));
    convOk = maxD <= 0.02;
    convDetail = `interior λ≈${lambda.toFixed(3)}x, max rel gap ${(maxD * 100).toFixed(2)}%`;
  } else if (lambda != null) {
    convDetail = `single interior λ≈${lambda.toFixed(3)}x`;
  }

  const revSum = CHANNELS.reduce((s, ch) => s + (forecast.channels[ch]?.forecastRevenue ?? 0), 0);
  const blendedOk =
    Math.abs(revSum - forecast.totalRevenue) < 2 &&
    Math.abs(forecast.blendedROAS - forecast.totalRevenue / budget) < 1e-6;

  const histConcaves: string[] = [];
  CHANNELS.forEach(ch => {
    const b = byCh[ch];
    if (!b) return;
    const sHist = b.curve.meanDailySpend;
    if (sHist <= 0) return;
    if (!assertConcaveAt(b.curve, sHist)) histConcaves.push(`${ch} convex at hist mean`);
    const marg = dailyLogMarginal(b.curve, sHist);
    if (marg > b.curve.historicalROAS + 0.05) {
      histConcaves.push(`${ch} mROAS@histMean ${marg.toFixed(2)}x > avg ${b.curve.historicalROAS.toFixed(2)}x`);
    }
  });

  const checks = {
    marginalLeCurveAvg: margFails.length
      ? fail(margFails.join('; '))
      : pass('mROAS ≤ ExpectedRevenue/RecSpend at recommended spend for all funded channels'),
    realizedBetween: sandwichFails.length
      ? fail(sandwichFails.join('; '))
      : pass('realized ROAS is between marginal ROAS and avg ROAS (hist avg only required at/above hist spend)'),
    spendSumsToBudget: Math.abs(spendSum - budget) <= 1
      ? pass(`sum ₹${spendSum.toFixed(2)}`)
      : fail(`sum ₹${spendSum.toFixed(2)} vs budget ₹${budget}`),
    emailSmsCaps: email <= EMAIL_MONTHLY_CAP + 1 && sms <= SMS_MONTHLY_CAP + 1
      ? pass(`Email ₹${email.toFixed(0)}, SMS ₹${sms.toFixed(0)}`)
      : fail(`Email ₹${email.toFixed(0)}, SMS ₹${sms.toFixed(0)}`),
    noLeakedCaps: leaked.length
      ? fail(`non-Email/SMS at cap values: ${leaked.join(', ')} — review water-fill`)
      : pass('no other channel sits on ₹15L or ₹12L'),
    waterFillConvergence: convOk ? pass(convDetail) : fail(convDetail),
    blendedMatches: blendedOk
      ? pass(`Σ ER = ₹${forecast.totalRevenue.toFixed(2)}, blended ${forecast.blendedROAS.toFixed(4)}x`)
      : fail('top-line blended revenue/ROAS mismatch'),
    limitedDataCount: flagged.length <= 2
      ? pass(`${flagged.length}/10 flagged`)
      : fail(`${flagged.length}/10 still flagged — threshold over-firing`),
    histPointConcave: histConcaves.length
      ? fail(histConcaves.join('; '))
      : pass('at historical mean daily spend, mROAS ≤ 3-year avg ROAS'),
  };

  const allPassed = Object.values(checks).every(c => c.ok);

  return { checks, lambda, flagged, diagnostics, allPassed };
}

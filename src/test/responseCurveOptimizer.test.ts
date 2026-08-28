/**
 * Concave log-curve mix: KKT water-fill on marginal ROAS.
 * Expected revenue is f(spend), not spend × average ROAS.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANNELS, type MarketingRecord } from '@/lib/mockData';
import {
  CHANNEL_SPEND_CAPS,
  computeChannelBaselines,
  computeCurrentMixForecast,
  computeRecommendedMix,
  validateRecommendedAllocation,
} from '@/lib/optimizer/calculations';
import {
  EMAIL_MONTHLY_CAP,
  LIMITED_DATA_CV_THRESHOLD,
  LIMITED_DATA_MIN_UNIQUE_LEVELS,
  LIMITED_DATA_P95_P5_THRESHOLD,
  SMS_MONTHLY_CAP,
} from '@/lib/optimizer/responseCurves';

const MONTHLY_BUDGET = 5_000_000;

function loadAssignmentData(): MarketingRecord[] {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/data/marketing_daily.json'), 'utf8'),
  ) as MarketingRecord[];
}

describe('response-curve optimizer', () => {
  it('prints the 10-channel table and passes every allocation check', () => {
    const records = loadAssignmentData();
    const baselines = computeChannelBaselines(records);
    const historicalAllocationPct = Object.fromEntries(
      baselines.map(b => [b.channel, b.historicalAllocationPct]),
    ) as Record<string, number>;

    const current = computeCurrentMixForecast(historicalAllocationPct, MONTHLY_BUDGET, baselines);
    const recommended = computeRecommendedMix(baselines, MONTHLY_BUDGET, 'base', historicalAllocationPct);
    const rec = recommended.forecast;
    const report = validateRecommendedAllocation(MONTHLY_BUDGET, baselines, rec);

    const linearIdentity = CHANNELS.reduce((s, ch) => {
      const row = rec.channels[ch];
      const roas = baselines.find(b => b.channel === ch)?.historicalROAS ?? 0;
      return s + row.forecastSpend * roas;
    }, 0);

    const lines = [
      '',
      '=== MIX ALLOCATOR (log curve + KKT water-fill) ===',
      `Limited-data rule: flag iff CV < ${LIMITED_DATA_CV_THRESHOLD * 100}% AND unique ₹100 levels < ${LIMITED_DATA_MIN_UNIQUE_LEVELS} AND p95/p5 < ${LIMITED_DATA_P95_P5_THRESHOLD}`,
      `recommended_mix_monthly_revenue_inr: ${rec.totalRevenue.toFixed(2)}`,
      `recommended_blended_roas: ${rec.blendedROAS.toFixed(4)}`,
      `linear_counterfactual: ${linearIdentity.toFixed(2)}`,
      'Channel | Current % | Rec % | Rec spend | Avg ROAS | Marg ROAS | Expected revenue | CV | unique | p95/p5 | flag',
      ...CHANNELS.map(ch => {
        const row = rec.channels[ch];
        const b = baselines.find(x => x.channel === ch)!;
        const histPct = b.historicalAllocationPct;
        const flag = row.limitedData ? 'Limited data' : '—';
        return [
          ch.padEnd(16),
          `${histPct.toFixed(1)}%`.padStart(7),
          `${row.allocationPct.toFixed(1)}%`.padStart(6),
          `₹${row.forecastSpend.toFixed(0)}`.padStart(12),
          `${row.historicalROAS.toFixed(2)}x`.padStart(8),
          `${row.marginalROAS.toFixed(2)}x`.padStart(9),
          `₹${row.forecastRevenue.toFixed(0)}`.padStart(14),
          `${(b.curve.spendCV * 100).toFixed(1)}%`.padStart(7),
          String(b.curve.uniqueSpendLevels).padStart(6),
          b.curve.p95p5Ratio.toFixed(2).padStart(6),
          flag,
        ].join(' | ');
      }),
      '--- checks ---',
      ...Object.entries(report.checks).map(([k, c]) => `${c.ok ? 'PASS' : 'FAIL'} ${k}: ${c.detail}`),
      ...report.flagged.map(f => `FLAG ${f.channel}: ${f.justification}`),
      `allPassed: ${report.allPassed}`,
      '========================================',
      '',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    expect(rec.totalRevenue).not.toBeCloseTo(linearIdentity, 0);
    expect(rec.totalRevenue).not.toBeCloseTo(26_782_586.22, 0);
    expect(rec.channels.Email.forecastSpend).toBeLessThanOrEqual(EMAIL_MONTHLY_CAP + 1);
    expect(rec.channels.SMS.forecastSpend).toBeLessThanOrEqual(SMS_MONTHLY_CAP + 1);
    expect(CHANNEL_SPEND_CAPS.Email).toBe(EMAIL_MONTHLY_CAP);
    expect(CHANNEL_SPEND_CAPS.SMS).toBe(SMS_MONTHLY_CAP);

    CHANNELS.forEach(ch => {
      if (ch === 'Email' || ch === 'SMS') return;
      const s = rec.channels[ch].forecastSpend;
      if (Math.abs(s - EMAIL_MONTHLY_CAP) < 1 || Math.abs(s - SMS_MONTHLY_CAP) < 1) {
        // eslint-disable-next-line no-console
        console.warn(`[cap coincidence] ${ch} landed on ₹${s.toFixed(0)} — review water-fill math`);
      }
    });

    expect(current.totalRevenue).toBeGreaterThan(0);
    expect(report.allPassed).toBe(true);
  });

  it('does not flag paid channels with 2×+ daily spend range', () => {
    const records = loadAssignmentData();
    const paid = ['Meta Ads', 'YouTube', 'Google Display', 'Google Search'];
    for (const name of paid) {
      const ch = computeChannelBaselines(records).find(b => b.channel === name)!;
      expect(ch.curve.p95p5Ratio).toBeGreaterThan(2);
      expect(ch.curve.limitedData).toBe(false);
    }
  });
});

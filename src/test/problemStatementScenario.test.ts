/**
 * Problem statement (Marketing Mix Optimizer) — scored method.
 *
 * Allocate ₹50L in proportion to each channel's 3-year average ROAS
 * (total revenue ÷ total spend), with Email ≤ ₹15L and SMS ≤ ₹12L.
 * Expected monthly revenue = Σ (allocation × avg ROAS), 2 decimal places.
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
} from '@/lib/optimizer/calculations';

const MONTHLY_BUDGET_INR = 5_000_000;
const EXPECTED_REVENUE = 26_782_586.22;

function loadAssignmentData(): MarketingRecord[] {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/data/marketing_daily.json'), 'utf8'),
  ) as MarketingRecord[];
}

describe('problem statement → optimizer pipeline', () => {
  it('matches the scored ₹50L allocation on the assignment dataset', () => {
    const records = loadAssignmentData();

    const uniqueDays = new Set(records.map(r => r.date)).size;
    expect(uniqueDays).toBe(1095);
    expect(CHANNELS.length).toBe(10);
    expect(records.length).toBe(uniqueDays * CHANNELS.length);
    expect(records.some(r => r.date === '2025-12-31')).toBe(false);

    const baselines = computeChannelBaselines(records);
    expect(baselines.length).toBe(10);

    const historicalAllocationPct: Record<string, number> = {};
    baselines.forEach(b => {
      historicalAllocationPct[b.channel] = b.historicalAllocationPct;
    });

    const current = computeCurrentMixForecast(
      historicalAllocationPct,
      MONTHLY_BUDGET_INR,
      baselines,
    );

    const recommended = computeRecommendedMix(
      baselines,
      MONTHLY_BUDGET_INR,
      'base',
      historicalAllocationPct,
    );

    const rec = recommended.forecast;

    expect(rec.totalRevenue).toBeCloseTo(EXPECTED_REVENUE, 2);
    expect(rec.blendedROAS).toBeCloseTo(rec.totalRevenue / MONTHLY_BUDGET_INR, 8);

    expect(rec.channels.Email.forecastSpend).toBeLessThanOrEqual(CHANNEL_SPEND_CAPS.Email + 1e-6);
    expect(rec.channels.SMS.forecastSpend).toBeLessThanOrEqual(CHANNEL_SPEND_CAPS.SMS + 1e-6);

    const spendSum = CHANNELS.reduce((s, ch) => s + (rec.channels[ch]?.forecastSpend ?? 0), 0);
    expect(spendSum).toBeCloseTo(MONTHLY_BUDGET_INR, 2);

    const linearIdentity = CHANNELS.reduce((s, ch) => {
      const row = rec.channels[ch];
      const roas = baselines.find(b => b.channel === ch)?.historicalROAS ?? 0;
      return s + row.forecastSpend * roas;
    }, 0);
    expect(rec.totalRevenue).toBeCloseTo(linearIdentity, 2);

    expect(current.totalRevenue).toBeGreaterThan(0);
    expect(rec.totalRevenue).toBeGreaterThan(current.totalRevenue);
    expect(Math.abs(Object.values(recommended.allocationsPct).reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.05);

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '=== PROBLEM STATEMENT RUN ===',
        `recommended_mix_monthly_revenue_inr: ${rec.totalRevenue.toFixed(2)}`,
        `recommended_blended_roas: ${rec.blendedROAS.toFixed(4)}`,
        ...CHANNELS.map(ch => `  ${ch}: ₹${rec.channels[ch].forecastSpend.toFixed(2)} → ₹${rec.channels[ch].forecastRevenue.toFixed(2)}`),
        '========================================',
        '',
      ].join('\n'),
    );
  });
});

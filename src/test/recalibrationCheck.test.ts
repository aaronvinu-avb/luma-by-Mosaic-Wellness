/**
 * Recalibration check: baselines → ROAS-proportional optimizer @ ₹50L.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANNELS, type MarketingRecord } from '@/lib/mockData';
import {
  computeChannelBaselines,
  computeCurrentMixForecast,
  computeRecommendedMix,
} from '@/lib/optimizer/calculations';

const MONTHLY_BUDGET = 5_000_000;
const MODE: 'base' = 'base';

function loadAssignmentData(): MarketingRecord[] {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/data/marketing_daily.json'), 'utf8'),
  ) as MarketingRecord[];
}

describe('recalibration check (₹50L, Base, 1mo)', () => {
  it('prints summary table + passes sanity ranges', () => {
    const records = loadAssignmentData();
    const baselines = computeChannelBaselines(records);

    const historicalAllocationPct: Record<string, number> = {};
    baselines.forEach(b => {
      historicalAllocationPct[b.channel] = b.historicalAllocationPct;
    });

    const currentForecast = computeCurrentMixForecast(
      historicalAllocationPct,
      MONTHLY_BUDGET,
      baselines,
    );

    const recommended = computeRecommendedMix(
      baselines,
      MONTHLY_BUDGET,
      MODE,
      historicalAllocationPct,
    );

    const recForecast = recommended.forecast;
    const upliftAbs = recForecast.totalRevenue - currentForecast.totalRevenue;
    const upliftPct = currentForecast.totalRevenue > 0 ? (upliftAbs / currentForecast.totalRevenue) * 100 : 0;

    const recSum = CHANNELS.reduce((s, ch) => s + (recommended.allocationsPct[ch] || 0), 0);

    const rows: string[] = [];
    rows.push('| Channel | Hist ROAS | Curve b | Rec % | Rec Spend | Forecast ROAS |');
    rows.push('|---------|-----------|---------|-------|-----------|---------------|');

    for (const ch of CHANNELS) {
      const b = baselines.find(x => x.channel === ch)!;
      const recPct = recommended.allocationsPct[ch] || 0;
      const recSpend = (recPct / 100) * MONTHLY_BUDGET;
      const fc = recForecast.channels[ch];
      const froas = fc && fc.forecastSpend > 0 ? fc.forecastRevenue / fc.forecastSpend : 0;
      rows.push(
        `| ${ch} | ${b.historicalROAS.toFixed(2)}x | ${b.curve.b.toFixed(3)} | ${recPct.toFixed(2)}% | ₹${(recSpend / 100000).toFixed(2)}L | ${froas.toFixed(2)}x |`,
      );
    }

    console.log('\n=== RECALIBRATION (assignment JSON) ===\n');
    console.log('Global inputs: monthlyBudget=₹50L, planningMode=Base, period=1mo (planningMonth=0)');
    console.log(rows.join('\n'));
    console.log('\n--- Portfolio ---');
    console.log(`Blended ROAS (current):  ${currentForecast.blendedROAS.toFixed(2)}x`);
    console.log(`Blended ROAS (recommended): ${recForecast.blendedROAS.toFixed(2)}x`);
    console.log(`Revenue forecast (current):  ₹${(currentForecast.totalRevenue / 1e7).toFixed(2)}Cr`);
    console.log(`Revenue forecast (recommended): ₹${(recForecast.totalRevenue / 1e7).toFixed(2)}Cr`);
    console.log(`Uplift: ₹${(upliftAbs / 1e5).toFixed(2)}L (${upliftPct.toFixed(2)}%)`);
    console.log(`Recommended allocation sum: ${recSum.toFixed(4)}% (expect 100)`);

    // Curve b: pipeline uses regularized b in [0.55, 0.9] ⊂ (0.3, 0.95)
    baselines.forEach(baseline => {
      expect(baseline.curve.b).toBeGreaterThan(0.3);
      expect(baseline.curve.b).toBeLessThan(0.95);
    });

    expect(Math.abs(recSum - 100)).toBeLessThan(0.02);
    CHANNELS.forEach(ch => {
      const p = recommended.allocationsPct[ch] || 0;
      expect(p).toBeGreaterThan(0);
    });
    expect(recommended.forecast.channels.Email.forecastSpend).toBeLessThanOrEqual(1_500_000);
    expect(recommended.forecast.channels.SMS.forecastSpend).toBeLessThanOrEqual(1_200_000);

    expect(currentForecast.blendedROAS).toBeGreaterThan(3);
    expect(currentForecast.blendedROAS).toBeLessThan(5.01);
    expect(currentForecast.totalRevenue).toBeGreaterThan(15_000_000);
    expect(currentForecast.totalRevenue).toBeLessThan(25_000_000);

    const emailRec = recommended.allocationsPct['Email'] ?? 0;
    const gdnRec = recommended.allocationsPct['Google Display'] ?? 0;
    expect(emailRec).toBeGreaterThan(10);
    expect(gdnRec).toBeLessThan(8);
  });

  it('planning modes produce different recommended allocations (exploration factor)', () => {
    const records = loadAssignmentData();
    const baselines = computeChannelBaselines(records);
    const historicalAllocationPct: Record<string, number> = {};
    baselines.forEach(b => {
      historicalAllocationPct[b.channel] = b.historicalAllocationPct;
    });
    const cons = computeRecommendedMix(baselines, MONTHLY_BUDGET, 'conservative', historicalAllocationPct);
    const base = computeRecommendedMix(baselines, MONTHLY_BUDGET, 'base', historicalAllocationPct);
    const agg = computeRecommendedMix(baselines, MONTHLY_BUDGET, 'aggressive', historicalAllocationPct);
    expect(cons.allocationsPct['Email']).not.toBe(agg.allocationsPct['Email']);
    expect(base.allocationsPct['Email']).toBeGreaterThanOrEqual(cons.allocationsPct['Email'] - 0.01);
    expect(agg.allocationsPct['Email']).toBeGreaterThanOrEqual(base.allocationsPct['Email'] - 0.01);
  });
});

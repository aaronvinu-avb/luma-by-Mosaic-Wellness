import { describe, expect, it } from 'vitest';
import { generateMockData, CHANNELS, type MarketingRecord } from '@/lib/mockData';
import { fetchMarketingApiPage } from '@/lib/marketingApi';
import {
  classifyChannelHealth,
  computeBudgetScenarios,
  computeChannelBaselines,
  computeCurrentMixForecast,
  computeRecommendedMix,
  computeTimingEffects,
} from '@/lib/optimizer/calculations';

const PAGE_LIMIT = 500;

async function fetchAllRecordsFromApi(): Promise<MarketingRecord[]> {
  const first = await fetchMarketingApiPage(1, PAGE_LIMIT);
  const totalPages = first.pagination?.total_pages ?? 1;
  const all: MarketingRecord[] = [...(first.rows as MarketingRecord[])];
  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await fetchMarketingApiPage(page, PAGE_LIMIT);
    all.push(...(payload.rows as MarketingRecord[]));
  }
  return all;
}

describe('optimizer final calculation verification', () => {
  it('prints full verification log and sanity checks', async () => {
    const records = await fetchAllRecordsFromApi().catch(() => generateMockData());
    const startDate = records[0]?.date ?? 'n/a';
    const endDate = records[records.length - 1]?.date ?? 'n/a';
    const baselines = computeChannelBaselines(records);
    const timing = computeTimingEffects(records);

    const historicalAllocationPct = Object.fromEntries(
      baselines.map(b => [b.channel, b.historicalAllocationPct]),
    ) as Record<string, number>;

    const monthlyBudget = 5_000_000;
    const currentForecast = computeCurrentMixForecast(
      historicalAllocationPct,
      monthlyBudget,
      baselines,
      { timingEffects: timing, planningMonth: 0 },
    );
    const recommended = computeRecommendedMix(
      baselines,
      monthlyBudget,
      'base',
      historicalAllocationPct,
      { timingEffects: timing, planningMonth: 0 },
    );
    const recForecast = recommended.forecast;

    const portfolioHistoricalROAS = (() => {
      const spend = baselines.reduce((s, b) => s + b.totalSpend, 0);
      const revenue = baselines.reduce((s, b) => s + b.totalRevenue, 0);
      return spend > 0 ? revenue / spend : 0;
    })();

    console.log('=== CALCULATION VERIFICATION ===');
    console.log('Total records loaded:', records.length);
    console.log('Date range:', startDate, 'to', endDate);
    console.log('--- Channel Baselines ---');
    baselines.forEach(ch => {
      const health = classifyChannelHealth(
        ch,
        monthlyBudget,
        historicalAllocationPct[ch.channel] ?? 0,
        portfolioHistoricalROAS,
      );
      console.log(ch.channel, {
        historical_ROAS: `${ch.historicalROAS.toFixed(2)}x`,
        avg_monthly_spend: `₹${(ch.avgMonthlySpend / 100000).toFixed(1)}L`,
        avg_monthly_revenue: `₹${(ch.avgMonthlyRevenue / 100000).toFixed(1)}L`,
        hist_allocation: `${ch.historicalAllocationPct.toFixed(1)}%`,
        curve_a: ch.curve.a.toFixed(4),
        curve_b: ch.curve.b.toFixed(4),
        health: health.status,
      });
    });
    console.log('--- Portfolio at ₹50L ---');
    console.log('Current blended ROAS:', `${currentForecast.blendedROAS.toFixed(2)}x`);
    console.log('Current revenue forecast: ₹' + (currentForecast.totalRevenue / 10000000).toFixed(2) + 'Cr');
    console.log('Recommended blended ROAS:', `${recForecast.blendedROAS.toFixed(2)}x`);
    console.log('Recommended revenue forecast: ₹' + (recForecast.totalRevenue / 10000000).toFixed(2) + 'Cr');
    console.log('Revenue uplift: ₹' + ((recForecast.totalRevenue - currentForecast.totalRevenue) / 100000).toFixed(1) + 'L');
    console.log('--- Recommended Allocation (%) ---');
    CHANNELS.forEach(ch => {
      console.log(ch, `${(recommended.allocationsPct[ch] || 0).toFixed(2)}%`);
    });
    console.log('--- Budget Scenarios ---');
    const scenarios = computeBudgetScenarios(
      baselines,
      [3500000, 4250000, 5000000, 6000000, 7500000],
      'base',
      historicalAllocationPct,
      { timingEffects: timing, planningMonth: 0 },
    );
    scenarios.forEach(s => {
      console.log(`₹${(s.budget / 100000).toFixed(1)}L`, {
        revenueCr: (s.totalRevenue / 10000000).toFixed(2),
        blendedROAS: `${s.blendedROAS.toFixed(2)}x`,
      });
    });

    expect(currentForecast.blendedROAS).toBeGreaterThan(3);
    expect(currentForecast.blendedROAS).toBeLessThan(6);
    expect(currentForecast.totalRevenue).toBeGreaterThan(15000000);
    expect(currentForecast.totalRevenue).toBeLessThan(25000000);
    expect(recForecast.totalRevenue).toBeGreaterThan(currentForecast.totalRevenue);
    expect(scenarios[4].totalRevenue).toBeGreaterThan(scenarios[0].totalRevenue);
    expect(scenarios[4].blendedROAS).toBeLessThan(scenarios[0].blendedROAS);
  }, 30000);
});


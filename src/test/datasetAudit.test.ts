import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { MarketingRecord } from '@/lib/mockData';
import { auditMarketingData } from '@/lib/dataQuality';
import { generateMockData } from '@/lib/mockData';
import {
  computeChannelBaselines,
  computeRecommendedMix,
  computeCurrentMixForecast,
} from '@/lib/optimizer/calculations';

const raw: MarketingRecord[] = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/marketing_daily.json'), 'utf8'),
);

describe('marketing_daily.json dataset audit', () => {
  it('reports coverage and consistency issues', () => {
    const report = auditMarketingData(raw);
    console.log('\n=== DATASET AUDIT ===');
    console.log('Records:', report.totalRecords);
    console.log('Range:', report.globalDateRange);
    console.log('Global gaps:', report.globalGapCount);
    console.log('Missing channels:', report.missingChannels);
    console.log('Unexpected channels:', report.unexpectedChannels);
    for (const c of report.channels) {
      if (c.gapCount || c.outlierDayCount || c.partialBoundaryMonths.length) {
        console.log(c.channel, { gaps: c.gapCount, outliers: c.outlierDayCount, partial: c.partialBoundaryMonths });
      }
    }

    const dates = new Set(raw.map(r => r.date));
    expect(dates.has('2025-12-31')).toBe(false);
    expect(raw.length).toBe(10_950); // 1095 days × 10 channels

    const mock = generateMockData();
    const sameAsMock = raw.length === mock.length && raw[0].spend === mock[0].spend;
    console.log('Identical to generateMockData():', sameAsMock);
  });

  it('optimizer sanity on real dataset', () => {
    const baselines = computeChannelBaselines(raw);
    const historicalAllocationPct = Object.fromEntries(
      baselines.map(b => [b.channel, b.historicalAllocationPct]),
    );
    const monthlyBudget = 5_000_000;
    const current = computeCurrentMixForecast(historicalAllocationPct, monthlyBudget, baselines, {});
    const rec = computeRecommendedMix(baselines, monthlyBudget, 'base', historicalAllocationPct, {});
    console.log('\nReal data optimizer:');
    console.log('Current ROAS:', current.blendedROAS.toFixed(2));
    console.log('Recommended ROAS:', rec.forecast.blendedROAS.toFixed(2));
    console.log('Channel historical ROAS:', baselines.map(b => `${b.channel}:${b.historicalROAS.toFixed(2)}`).join(', '));
    expect(current.blendedROAS).toBeGreaterThan(0);
  });
});

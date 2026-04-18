import { describe, expect, it } from "vitest";
import {
  computeRevenueUpliftMetrics,
  getOptimalAllocationNonLinear,
  getTimeFrameMonths,
  normalizeAllocationShares,
  type SaturationModel,
} from "@/lib/calculations";
import type { MarketingRecord } from "@/lib/mockData";

describe("calculations helpers", () => {
  it("returns normalized allocation fractions", () => {
    const models: SaturationModel[] = [
      { channel: "Meta Ads", alpha: 10, scatterPoints: [], saturationPoint: 9 },
      { channel: "Google Search", alpha: 8, scatterPoints: [], saturationPoint: 7 },
    ];

    const fractions = getOptimalAllocationNonLinear(models, 1_000_000);
    const sum = Object.values(fractions).reduce((acc, value) => acc + value, 0);

    expect(sum).toBeCloseTo(1, 6);
    expect(fractions["Meta Ads"]).toBeGreaterThan(0);
    expect(fractions["Google Search"]).toBeGreaterThan(0);
  });

  it("estimates timeframe months from unique daily records", () => {
    const days: MarketingRecord[] = Array.from({ length: 61 }, (_, idx) => ({
      date: `2025-01-${String((idx % 31) + 1).padStart(2, "0")}`,
      day_of_week: "Mon",
      channel: "Meta Ads",
      spend: 100,
      revenue: 250,
      roas: 2.5,
      impressions: 1000,
      clicks: 50,
      conversions: 5,
      new_customers: 3,
      ctr: 5,
      cpc: 2,
      cpa: 20,
      aov: 50,
    }));

    const months = getTimeFrameMonths(days);
    expect(months).toBeGreaterThan(1);
  });

  it("defines revenue opportunity as optimized minus current", () => {
    const { revenueOpportunity, upliftPct } = computeRevenueUpliftMetrics(1_000_000, 1_050_000);
    expect(revenueOpportunity).toBe(50_000);
    expect(upliftPct).toBeCloseTo(5, 5);
  });

  it("normalizes manual allocation weights to sum to 1", () => {
    const norm = normalizeAllocationShares({
      "Meta Ads": 0.3,
      "Google Search": 0.3,
    } as Record<string, number>);
    const sum = Object.values(norm).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

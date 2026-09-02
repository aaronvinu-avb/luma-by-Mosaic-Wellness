import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchMarketingApiPage, MarketingApiError, isStaticMarketingJsonUrl } from '@/lib/marketingApi';

describe('fetchMarketingApiPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects HTML responses that return HTTP 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<!DOCTYPE html><html><body>SPA fallback</body></html>',
    } as Response);

    await expect(fetchMarketingApiPage(1, 500, 'https://example.com/api/data')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof MarketingApiError && /HTML instead of JSON/.test(err.message),
    );
  });

  it('parses JSON array payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () =>
        JSON.stringify([
          {
            date: '2024-01-01',
            day_of_week: 'Mon',
            channel: 'Meta',
            spend: 100,
            revenue: 200,
            roas: 2,
            impressions: 1,
            clicks: 1,
            conversions: 1,
            new_customers: 1,
            ctr: 1,
            cpc: 1,
            cpa: 1,
            aov: 1,
          },
        ]),
    } as Response);

    const result = await fetchMarketingApiPage(1, 500, 'https://example.com/api/data');
    expect(result.rows).toHaveLength(1);
  });

  it('treats static .json URLs as a single-page dump', async () => {
    expect(isStaticMarketingJsonUrl('/data/marketing_daily.json')).toBe(true);

    const sample = [{ date: '2024-01-01', day_of_week: 'Mon', channel: 'Meta', spend: 1, revenue: 2, roas: 2, impressions: 1, clicks: 1, conversions: 1, new_customers: 1, ctr: 1, cpc: 1, cpa: 1, aov: 1 }];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify(sample),
    } as Response);

    const page1 = await fetchMarketingApiPage(1, 500, '/data/marketing_daily.json');
    expect(page1.rows).toHaveLength(1);
    expect(page1.pagination?.total_pages).toBe(1);

    const page2 = await fetchMarketingApiPage(2, 500, '/data/marketing_daily.json');
    expect(page2.rows).toHaveLength(0);
  });
});

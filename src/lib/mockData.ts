export interface MarketingRecord {
  date: string;
  day_of_week: string;  // API provides: 'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'
  channel: string;
  spend: number;
  revenue: number;
  roas: number;         // Pre-computed by API
  impressions: number;
  clicks: number;
  conversions: number;
  new_customers: number;
  ctr: number;
  cpc: number;
  cpa: number;
  aov: number;
}

const CHANNELS = [
  'Meta Ads', 'Google Search', 'Google Display', 'YouTube',
  'Instagram Reels', 'Email', 'SMS', 'Influencer', 'Affiliate', 'Organic Social'
];

const channelProfiles: Record<string, { avgSpend: number; roas: number; ctr: number; convRate: number; custRate: number }> = {
  'Meta Ads':        { avgSpend: 85000,  roas: 3.2, ctr: 0.018, convRate: 0.035, custRate: 0.6 },
  'Google Search':   { avgSpend: 95000,  roas: 4.1, ctr: 0.045, convRate: 0.055, custRate: 0.5 },
  'Google Display':  { avgSpend: 45000,  roas: 1.8, ctr: 0.008, convRate: 0.015, custRate: 0.4 },
  'YouTube':         { avgSpend: 70000,  roas: 2.5, ctr: 0.012, convRate: 0.025, custRate: 0.45 },
  'Instagram Reels': { avgSpend: 60000,  roas: 3.5, ctr: 0.022, convRate: 0.040, custRate: 0.55 },
  'Email':           { avgSpend: 15000,  roas: 5.5, ctr: 0.035, convRate: 0.065, custRate: 0.7 },
  'SMS':             { avgSpend: 12000,  roas: 4.8, ctr: 0.028, convRate: 0.050, custRate: 0.65 },
  'Influencer':      { avgSpend: 50000,  roas: 2.8, ctr: 0.015, convRate: 0.030, custRate: 0.5 },
  'Affiliate':       { avgSpend: 35000,  roas: 3.8, ctr: 0.020, convRate: 0.045, custRate: 0.6 },
  'Organic Social':  { avgSpend: 8000,   roas: 6.2, ctr: 0.040, convRate: 0.070, custRate: 0.75 },
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export function generateMockData(): MarketingRecord[] {
  const records: MarketingRecord[] = [];
  const rand = seededRandom(42);
  const startDate = new Date(Date.UTC(2023, 0, 1));
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let dayOffset = 0; dayOffset < 1095; dayOffset++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dateStr = date.toISOString().slice(0, 10);
    const day_of_week = DOW[date.getUTCDay()];
    for (const channel of CHANNELS) {
      const p = channelProfiles[channel];
      const seasonality = 1 + 0.3 * Math.sin((dayOffset / 365) * 2 * Math.PI);
      const noise = 0.7 + rand() * 0.6;
      const spend = Math.round(p.avgSpend * seasonality * noise / 30);
      const revenue = Math.round(spend * p.roas * (0.8 + rand() * 0.4));
      const roas = spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0;
      const impressions = Math.round(spend / (0.5 + rand() * 1.5) * 10);
      const clicks = Math.round(impressions * p.ctr * (0.7 + rand() * 0.6));
      const conversions = Math.round(clicks * p.convRate * (0.6 + rand() * 0.8));
      const new_customers = Math.round(conversions * p.custRate * (0.5 + rand() * 1));
      const ctr = impressions > 0 ? parseFloat((clicks / impressions * 100).toFixed(2)) : 0;
      const cpc = clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0;
      const cpa = conversions > 0 ? parseFloat((spend / conversions).toFixed(2)) : 0;
      const aov = conversions > 0 ? parseFloat((revenue / conversions).toFixed(2)) : 0;
      records.push({ date: dateStr, day_of_week, channel, spend, revenue, roas, impressions, clicks, conversions, new_customers, ctr, cpc, cpa, aov });
    }
  }
  return records;
}

// High-visibility, brand-aligned channel colour palette (Option 1)
export const CHANNEL_COLORS = [
  '#0668E1', // Meta Ads (Facebook Blue)
  '#34A853', // Google Search (Google Green)
  '#FBBC05', // Google Display (Google Yellow)
  '#FF0000', // YouTube (YouTube Red)
  '#E1306C', // Instagram Reels (Insta Pink/Magenta)
  '#00B8D9', // Email (Cyan/Teal)
  '#34C759', // SMS (iMessage Green)
  '#FF6B6B', // Influencer (Coral/Peach)
  '#8B5CF6', // Affiliate (Vibrant Purple)
  '#1DA1F2', // Organic Social (Twitter Blue)
];

export { CHANNELS };

/**
 * Repairs marketing_daily.json:
 * 1. Imputes missing 2025-12-31 (10 channel rows) from same-DOW December averages
 * 2. Corrects day_of_week from calendar date
 * 3. Recomputes derived metrics (roas, ctr, cpc, cpa, aov) from base fields
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../public/data/marketing_daily.json');

const CHANNELS = [
  'Meta Ads', 'Google Search', 'Google Display', 'YouTube',
  'Instagram Reels', 'Email', 'SMS', 'Influencer', 'Affiliate', 'Organic Social',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BASE_FIELDS = ['spend', 'revenue', 'impressions', 'clicks', 'conversions', 'new_customers'];

function parseLocalDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayOfWeek(ymd) {
  return DOW[parseLocalDate(ymd).getDay()];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function repairDerived(r) {
  const spend = r.spend;
  const revenue = r.revenue;
  const impressions = r.impressions;
  const clicks = r.clicks;
  const conversions = r.conversions;
  return {
    ...r,
    day_of_week: dayOfWeek(r.date),
    roas: spend > 0 ? round2(revenue / spend) : 0,
    ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? round2(spend / clicks) : 0,
    cpa: conversions > 0 ? round2(spend / conversions) : 0,
    aov: conversions > 0 ? round2(revenue / conversions) : 0,
  };
}

function averageRecords(rows) {
  const out = {};
  for (const f of BASE_FIELDS) {
    out[f] = round2(rows.reduce((s, r) => s + r[f], 0) / rows.length);
  }
  return out;
}

function imputeMissingDay(records, targetDate) {
  const targetDow = dayOfWeek(targetDate);
  const monthPrefix = targetDate.slice(0, 7);
  const imputed = [];

  for (const channel of CHANNELS) {
    const peers = records.filter(
      (r) => r.channel === channel && r.date.startsWith(monthPrefix) && r.day_of_week === targetDow,
    );
    if (peers.length === 0) {
      throw new Error(`No peer rows to impute ${targetDate} for ${channel}`);
    }
    const base = averageRecords(peers);
    imputed.push(repairDerived({
      date: targetDate,
      day_of_week: targetDow,
      channel,
      ...base,
      roas: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      aov: 0,
    }));
  }

  return imputed;
}

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dates = new Set(raw.map((r) => r.date));
const issues = { wrongDow: 0, missingDec31: !dates.has('2025-12-31') };

let records = raw.map((r) => {
  const fixed = repairDerived(r);
  if (fixed.day_of_week !== r.day_of_week) issues.wrongDow += 1;
  return fixed;
});

if (issues.missingDec31) {
  records = records.concat(imputeMissingDay(records, '2025-12-31'));
}

records.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));

// Validate
const keys = new Set();
for (const r of records) {
  const key = `${r.date}|${r.channel}`;
  if (keys.has(key)) throw new Error(`Duplicate after repair: ${key}`);
  keys.add(key);
}

const expectedDays = Math.floor(
  (parseLocalDate('2025-12-31') - parseLocalDate('2023-01-01')) / 86_400_000,
) + 1;
const uniqueDates = new Set(records.map((r) => r.date));

writeFileSync(DATA_PATH, `${JSON.stringify(records, null, 2)}\n`);

console.log('Repaired', DATA_PATH);
console.log('Records:', records.length, '(was', raw.length, ')');
console.log('Unique dates:', uniqueDates.size, 'expected:', expectedDays);
console.log('Fixed day_of_week:', issues.wrongDow);
console.log('Imputed 2025-12-31:', issues.missingDec31);

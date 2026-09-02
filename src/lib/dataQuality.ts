/**
 * dataQuality.ts
 *
 * Read-only integrity audit of the raw marketing dataset.
 *
 * Produces a per-channel quality report (record count, date coverage, gaps,
 * outliers, partial boundary months) and a portfolio-wide roll-up. Intended
 * to run once on successful fetch to surface silent data issues in the
 * console — without mutating or masking the underlying data.
 *
 * No calculation is based on this module; it is pure observability.
 */

import type { MarketingRecord } from './mockData';
import { CHANNELS } from './mockData';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelQualityReport {
  channel: string;
  recordCount: number;
  /** Distinct calendar dates observed for this channel. */
  uniqueDateCount: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Dates within [firstDate, lastDate] that are missing for this channel. */
  gapCount: number;
  gapDates: string[]; // capped at 20 for log readability
  /** Days where spend === 0 (real zero-spend days; not a data gap). */
  zeroSpendDays: number;
  maxSpendDay: { date: string; spend: number } | null;
  /** Lowest positive-spend day (true-zero days are excluded). */
  minPositiveSpendDay: { date: string; spend: number } | null;
  /** Outliers by spend (robust MAD-based test: |x − median| > 5·MAD). */
  outlierDayCount: number;
  outlierSampleDays: { date: string; spend: number }[]; // capped at 5
  /** Months at the start/end of the dataset with < 80% of expected days. */
  partialBoundaryMonths: { month: string; daysPresent: number; daysInMonth: number }[];
}

export interface DataQualityReport {
  totalRecords: number;
  totalNormalizedDropped: number;
  expectedChannelCount: number;
  observedChannels: string[];
  missingChannels: string[];
  /** Channels present in the data that are not in our known CHANNELS list. */
  unexpectedChannels: string[];
  globalDateRange: { first: string | null; last: string | null };
  globalGapCount: number;
  channels: ChannelQualityReport[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1;
}

function daysInMonth(yyyyMm: string): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/** Robust outlier detection using median and median absolute deviation. */
function madOutlierIndices(values: number[], threshold = 5): Set<number> {
  if (values.length < 8) return new Set();
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 1;
  const out = new Set<number>();
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] - median) > threshold * mad) out.add(i);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

export function auditMarketingData(
  records: MarketingRecord[],
  totalNormalizedDropped = 0,
): DataQualityReport {
  if (!records || records.length === 0) {
    return {
      totalRecords: 0,
      totalNormalizedDropped,
      expectedChannelCount: CHANNELS.length,
      observedChannels: [],
      missingChannels: [...CHANNELS],
      unexpectedChannels: [],
      globalDateRange: { first: null, last: null },
      globalGapCount: 0,
      channels: [],
    };
  }

  // Bucket by channel once — O(N).
  const byChannel = new Map<string, MarketingRecord[]>();
  let globalMin = records[0].date;
  let globalMax = records[0].date;
  for (const r of records) {
    if (!r.date || !r.channel) continue;
    if (r.date < globalMin) globalMin = r.date;
    if (r.date > globalMax) globalMax = r.date;
    const list = byChannel.get(r.channel);
    if (list) list.push(r); else byChannel.set(r.channel, [r]);
  }

  const observedChannels = Array.from(byChannel.keys()).sort();
  const known = new Set(CHANNELS);
  const missingChannels = CHANNELS.filter((c) => !byChannel.has(c));
  const unexpectedChannels = observedChannels.filter((c) => !known.has(c));

  // Global unique-date set to estimate portfolio-level gaps.
  const globalDates = new Set<string>();
  records.forEach((r) => r.date && globalDates.add(r.date));
  const expectedSpanDays = daysBetweenInclusive(globalMin, globalMax);
  const globalGapCount = Math.max(0, expectedSpanDays - globalDates.size);

  const channelReports: ChannelQualityReport[] = CHANNELS.map((channel) => {
    const rows = byChannel.get(channel) ?? [];
    if (rows.length === 0) {
      return {
        channel,
        recordCount: 0,
        uniqueDateCount: 0,
        firstDate: null,
        lastDate: null,
        gapCount: 0,
        gapDates: [],
        zeroSpendDays: 0,
        maxSpendDay: null,
        minPositiveSpendDay: null,
        outlierDayCount: 0,
        outlierSampleDays: [],
        partialBoundaryMonths: [],
      };
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));
    const dateSet = new Set(rows.map((r) => r.date));
    const firstDate = rows[0].date;
    const lastDate  = rows[rows.length - 1].date;

    // Detect missing dates within the channel's own coverage window.
    const gapDates: string[] = [];
    const expectedDays = daysBetweenInclusive(firstDate, lastDate);
    if (expectedDays > dateSet.size) {
      let cursor = firstDate;
      while (cursor <= lastDate) {
        if (!dateSet.has(cursor)) gapDates.push(cursor);
        if (gapDates.length >= 20) break; // cap for log readability
        cursor = addDays(cursor, 1);
      }
    }
    const gapCount = expectedDays - dateSet.size;

    // Spend distribution.
    let zeroSpendDays = 0;
    let maxSpendDay: { date: string; spend: number } | null = null;
    let minPositiveSpendDay: { date: string; spend: number } | null = null;
    const spends: number[] = [];
    const spendDates: string[] = [];
    for (const r of rows) {
      const s = Number(r.spend) || 0;
      if (s === 0) zeroSpendDays += 1;
      if (!maxSpendDay || s > maxSpendDay.spend) maxSpendDay = { date: r.date, spend: s };
      if (s > 0 && (!minPositiveSpendDay || s < minPositiveSpendDay.spend)) {
        minPositiveSpendDay = { date: r.date, spend: s };
      }
      spends.push(s);
      spendDates.push(r.date);
    }

    // Outliers (robust: MAD on positive-spend days only, so zero days don't skew).
    const positiveIdx = spends.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
    const positives = positiveIdx.map((i) => spends[i]);
    const outlierPosIdx = madOutlierIndices(positives);
    const outlierSampleDays: { date: string; spend: number }[] = [];
    let outlierDayCount = 0;
    outlierPosIdx.forEach((pi) => {
      outlierDayCount += 1;
      if (outlierSampleDays.length < 5) {
        const i = positiveIdx[pi];
        outlierSampleDays.push({ date: spendDates[i], spend: spends[i] });
      }
    });

    // Partial boundary months — flag the first and last month if their observed
    // day count is materially below the calendar month length.
    const partialBoundaryMonths: ChannelQualityReport['partialBoundaryMonths'] = [];
    const firstMonth = firstDate.slice(0, 7);
    const lastMonth  = lastDate.slice(0, 7);
    for (const m of firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]) {
      const days = rows.filter((r) => r.date.startsWith(m)).length;
      const dim = daysInMonth(m);
      if (days < dim * 0.8) partialBoundaryMonths.push({ month: m, daysPresent: days, daysInMonth: dim });
    }

    return {
      channel,
      recordCount: rows.length,
      uniqueDateCount: dateSet.size,
      firstDate,
      lastDate,
      gapCount,
      gapDates,
      zeroSpendDays,
      maxSpendDay,
      minPositiveSpendDay,
      outlierDayCount,
      outlierSampleDays,
      partialBoundaryMonths,
    };
  });

  return {
    totalRecords: records.length,
    totalNormalizedDropped,
    expectedChannelCount: CHANNELS.length,
    observedChannels,
    missingChannels,
    unexpectedChannels,
    globalDateRange: { first: globalMin, last: globalMax },
    globalGapCount,
    channels: channelReports,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Console logging — grouped, scannable summary
// ─────────────────────────────────────────────────────────────────────────────

export function logDataQualityReport(report: DataQualityReport): void {
  if (!import.meta.env.DEV) return;
  const label = '[Luma · Data Audit]';
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `${label} ${report.totalRecords.toLocaleString()} records · ` +
    `${report.observedChannels.length}/${report.expectedChannelCount} channels · ` +
    `${report.globalDateRange.first ?? '—'} → ${report.globalDateRange.last ?? '—'}`,
  );

  if (report.missingChannels.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`${label} Missing channels: ${report.missingChannels.join(', ')}`);
  }
  if (report.unexpectedChannels.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`${label} Unexpected channels in feed: ${report.unexpectedChannels.join(', ')}`);
  }
  if (report.totalNormalizedDropped > 0) {
    // eslint-disable-next-line no-console
    console.warn(`${label} ${report.totalNormalizedDropped} raw record(s) dropped in normalization.`);
  }
  if (report.globalGapCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(`${label} Portfolio-level date coverage has ${report.globalGapCount} missing day(s) across the full range.`);
  }

  const lastDate = report.globalDateRange.last;
  if (lastDate) {
    const [y, m] = lastDate.split('-').map(Number);
    const dim = daysInMonth(`${y}-${String(m).padStart(2, '0')}`);
    const lastDay = Number(lastDate.slice(8, 10));
    if (lastDay < dim) {
      // eslint-disable-next-line no-console
      console.warn(
        `${label} Dataset ends on ${lastDate} but ${y}-${String(m).padStart(2, '0')} has ${dim} days — final calendar day(s) may be missing.`,
      );
    }
  }

  // Per-channel summary row
  const rows = report.channels.map((c) => ({
    channel: c.channel,
    records: c.recordCount,
    range: c.firstDate && c.lastDate ? `${c.firstDate} → ${c.lastDate}` : '—',
    gaps: c.gapCount,
    zeroDays: c.zeroSpendDays,
    outliers: c.outlierDayCount,
    maxSpend: c.maxSpendDay ? `${c.maxSpendDay.date} (${Math.round(c.maxSpendDay.spend).toLocaleString()})` : '—',
    minPosSpend: c.minPositiveSpendDay ? `${c.minPositiveSpendDay.date} (${Math.round(c.minPositiveSpendDay.spend).toLocaleString()})` : '—',
    partialMonths: c.partialBoundaryMonths.map((p) => `${p.month} (${p.daysPresent}/${p.daysInMonth})`).join(', ') || '—',
  }));
  // eslint-disable-next-line no-console
  console.table(rows);

  // Detailed channel warnings
  for (const c of report.channels) {
    if (c.recordCount === 0) {
      // eslint-disable-next-line no-console
      console.warn(`${label} ${c.channel}: NO records in dataset.`);
      continue;
    }
    if (c.gapCount > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `${label} ${c.channel}: ${c.gapCount} missing day(s) within its own range. First up-to-20: ${c.gapDates.join(', ')}`,
      );
    }
    if (c.partialBoundaryMonths.length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `${label} ${c.channel}: partial boundary month(s) — ` +
          c.partialBoundaryMonths.map((p) => `${p.month} covers ${p.daysPresent}/${p.daysInMonth} days`).join(', '),
      );
    }
    if (c.outlierDayCount > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `${label} ${c.channel}: ${c.outlierDayCount} outlier spend day(s) (MAD>5). Sample: ` +
          c.outlierSampleDays.map((d) => `${d.date} ₹${Math.round(d.spend).toLocaleString()}`).join(', '),
      );
    }
  }

  // eslint-disable-next-line no-console
  console.groupEnd();
}

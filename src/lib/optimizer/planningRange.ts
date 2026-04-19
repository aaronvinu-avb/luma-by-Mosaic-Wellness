import type { MonthPoint } from '@/lib/calculations';

/** Full month grid for optimizer planning windows (shared by context + model hook). */
export const OPTIMIZER_TIMELINE_MONTHS: MonthPoint[] = (() => {
  const start = 2023;
  const end = 2027;
  return Array.from({ length: (end - start + 1) * 12 }, (_, i) => {
    const y = start + Math.floor(i / 12);
    const mo = i % 12;
    return { key: `${y}-${String(mo + 1).padStart(2, '0')}`, year: y, month: mo };
  });
})();

export function buildMonthRange(
  period: '1m' | '1q' | '6m' | '1y' | 'custom',
  customStartMonth: string,
  customEndMonth: string,
): MonthPoint[] {
  if (period === 'custom') {
    const startIdx = OPTIMIZER_TIMELINE_MONTHS.findIndex(m => m.key === customStartMonth);
    const endIdx = OPTIMIZER_TIMELINE_MONTHS.findIndex(m => m.key === customEndMonth);
    if (startIdx < 0 || endIdx < 0) return [];
    return OPTIMIZER_TIMELINE_MONTHS.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
  }
  const currentMonthKey = '2025-01';
  const startIdx = Math.max(0, OPTIMIZER_TIMELINE_MONTHS.findIndex(m => m.key === currentMonthKey));
  const len = period === '1m' ? 1 : period === '1q' ? 3 : period === '6m' ? 6 : 12;
  return OPTIMIZER_TIMELINE_MONTHS.slice(startIdx, startIdx + len);
}

export function planningDurationMonths(
  period: '1m' | '1q' | '6m' | '1y' | 'custom',
  customStartMonth: string,
  customEndMonth: string,
): number {
  const r = buildMonthRange(period, customStartMonth, customEndMonth);
  return Math.max(1, r.length);
}

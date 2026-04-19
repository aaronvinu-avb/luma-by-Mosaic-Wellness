export function formatINR(value: number): string {
  const abs = Math.abs(Math.round(value));
  const s = abs.toString();
  if (s.length <= 3) return `₹${value < 0 ? '-' : ''}${s}`;
  
  let result = s.slice(-3);
  let remaining = s.slice(0, -3);
  while (remaining.length > 2) {
    result = remaining.slice(-2) + ',' + result;
    remaining = remaining.slice(0, -2);
  }
  if (remaining.length > 0) {
    result = remaining + ',' + result;
  }
  return `${value < 0 ? '-' : ''}₹${result}`;
}

/**
 * Compact INR for dashboards (spend, revenue, budget).
 * - ≥ ₹1Cr → ₹X.XXCr
 * - ≥ ₹1L → ₹XL (whole lakhs)
 * - ≥ ₹1K → ₹XXK (whole thousands, no decimal)
 * - &lt; ₹1K → full grouped amount via `formatINR`
 */
export function formatINRCompact(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${sign}₹${Math.round(abs / 100_000)}L`;
  if (abs >= 1_000) return `${sign}₹${Math.round(abs / 1_000)}K`;
  return formatINR(value);
}

/**
 * Standard ROAS formatter used across every page.
 *  - 2 decimal places (e.g. "3.45x")
 *  - graceful fallback for NaN / Infinity / zero-spend
 *    (avoids showing "NaNx" or "Infinityx" on data-gap rows)
 */
export function formatROAS(value: number): string {
  if (!isFinite(value) || isNaN(value) || value <= 0) return '—';
  return `${value.toFixed(2)}x`;
}

/**
 * Compact large-integer formatter for clicks / impressions / conversions.
 * Uses M / K suffixes per dashboard spec. Values < 1,000 are printed in full
 * using the Indian comma grouping (to match the rest of the app).
 */
export function formatCompactInt(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs).toLocaleString('en-IN')}`;
}

/**
 * Signed percentage formatter (e.g. "+3.2%" / "-1.5%").
 * Used by delta KPIs and anomaly callouts.
 */
export function formatPctDelta(value: number, decimals = 1): string {
  if (!isFinite(value) || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

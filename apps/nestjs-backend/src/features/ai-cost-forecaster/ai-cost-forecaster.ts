/**
 * AI cost forecaster — predicts the next billing cycle's AI credit
 * consumption from historical `ai-usage` rows so operators can warn
 * tenants before they overrun their plan.
 *
 * The model is intentionally simple: a linear projection over the last
 * `LOOKBACK_DAYS` of usage, scaled by the number of days until the next
 * billing cycle starts.  No ML — just a moving average + linear
 * extrapolation that captures the obvious "burn is accelerating" trend
 * before the more expensive cloud spend actually shows up on the bill.
 *
 * If we have fewer than `MIN_LOOKBACK_DAYS` of data, the forecaster
 * returns the per-day average only and flags the result as "low
 * confidence" so the caller can decide whether to surface it as a real
 * estimate or as "we don't know yet".
 *
 * License: AGPL-3.0
 */

export interface UsageRow {
  /** ISO date of the usage (YYYY-MM-DD). */
  date: string;
  /** AI credits consumed on that date. */
  credits: number;
}

export interface ForecastInput {
  rows: UsageRow[];
  /** Anchor date for the forecast (defaults to today). */
  today?: Date;
  /** Days until the next billing cycle. */
  days_until_cycle_end: number;
}

export interface ForecastOutput {
  /** Projected total credits by the end of the cycle. */
  projected_total: number;
  /** Mean daily credits over the lookback window. */
  mean_per_day: number;
  /** Trend slope (credits per day per day). Positive = accelerating burn. */
  trend_slope: number;
  /** Confidence flag — `low` when the input is too sparse to extrapolate. */
  confidence: 'low' | 'medium' | 'high';
  /** True when `projected_total` exceeds `alert_threshold_credits`. */
  would_exceed_alert: boolean;
  /** Echo of the alert threshold used (credits). */
  alert_threshold_credits: number;
}

const LOOKBACK_DAYS = 14;
const MIN_LOOKBACK_DAYS = 3;
const DEFAULT_ALERT_THRESHOLD = 80;

/**
 * Linear-regression slope over (x=days-from-start, y=credits-per-day).
 * Pure-function; no deps.  Returns 0 if the input is too short or
 * degenerate (all zero, single row).
 */
export function linearSlope(series: Array<{ x: number; y: number }>): number {
  const k = series.length;
  if (k < 2) return 0;
  const meanX = series.reduce((a, p) => a + p.x, 0) / k;
  const meanY = series.reduce((a, p) => a + p.y, 0) / k;
  let num = 0;
  let den = 0;
  for (const p of series) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  if (den === 0) return 0;
  return num / den;
}

/**
 * Forecast the next cycle's AI credit consumption.
 *
 * `alert_threshold_credits` defaults to 80 (matches the Cloud "Pro"
 * plan's monthly AI credit allotment); pass an explicit value to match
 * the tenant's plan.
 */
export function forecastCredits(
  input: ForecastInput,
  alert_threshold_credits: number = DEFAULT_ALERT_THRESHOLD
): ForecastOutput {
  const today = input.today ?? new Date();
  // Bucket rows by date — keep the most recent LOOKBACK_DAYS days.
  const cutoff = new Date(today.getTime() - LOOKBACK_DAYS * 86400 * 1000);
  const recent = input.rows
    .filter((r) => new Date(r.date + 'T00:00:00Z') >= cutoff)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (recent.length < MIN_LOOKBACK_DAYS) {
    const fallback = recent.reduce((a, r) => a + r.credits, 0) / Math.max(1, recent.length);
    const projected_total = fallback * (input.days_until_cycle_end + recent.length);
    return {
      projected_total,
      mean_per_day: fallback,
      trend_slope: 0,
      confidence: 'low',
      would_exceed_alert: projected_total > alert_threshold_credits,
      alert_threshold_credits,
    };
  }

  // Convert to (x, y) where x is days from the oldest row in window.
  const oldest = new Date(recent[0].date + 'T00:00:00Z').getTime();
  const series = recent.map((r) => ({
    x: (new Date(r.date + 'T00:00:00Z').getTime() - oldest) / 86400 / 1000,
    y: r.credits,
  }));
  const slope = linearSlope(series);
  const meanPerDay = series.reduce((a, p) => a + p.y, 0) / series.length;

  // Project forward: y(days_from_now) = mean + slope * (days_into_lookback_at_now + days_forward)
  const daysIntoLookback = series[series.length - 1].x;
  const projectedPerDay = meanPerDay + slope * daysIntoLookback;
  const projected_total = Math.max(0, projectedPerDay * Math.max(0, input.days_until_cycle_end));

  // Confidence based on how much of the window is non-zero (sparse weeks
  // should not be treated as high-confidence trends).
  const nonZeroDays = series.filter((p) => p.y > 0).length;
  const confidence: ForecastOutput['confidence'] =
    nonZeroDays >= LOOKBACK_DAYS ? 'high' : nonZeroDays >= 7 ? 'medium' : 'low';

  return {
    projected_total,
    mean_per_day: meanPerDay,
    trend_slope: slope,
    confidence,
    would_exceed_alert: projected_total > alert_threshold_credits,
    alert_threshold_credits,
  };
}

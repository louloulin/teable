/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Cron schedule helpers (R56).
 *
 * Minimal pure-function cron scheduler for billing-portal housekeeping
 * jobs (stale-link refresh, usage meter reporting, invoice retry, etc.).
 *
 * Supported syntax (subset, sufficient for billing cron):
 *   "<star>/N * * * *"   every N minutes
 *   "M * * * *"          at minute M of every hour
 *   "M H * * *"          at M minutes past H hour, daily
 *   "M H DoM * *"        at M minutes past H hour, on day-of-month
 *   "* * * * *"          every minute (escape hatch)
 *
 * Five-field format only (minute hour day-of-month month day-of-week).
 * Day-of-week is recognized but not used for matching (monthly jobs use
 * day-of-month). This matches the format BillingDunningWorker callers use.
 *
 * License: AGPL-3.0
 */

export interface ICronSchedule {
  /** Original expression, preserved for diagnostics. */
  expression: string;
  /** Minutes (0-59) when the schedule should fire. */
  minutes: ReadonlyArray<number>;
  /** Hours (0-23) when the schedule should fire. undefined = every hour. */
  hours: ReadonlyArray<number> | null;
  /** Days-of-month (1-31). undefined = every day. */
  daysOfMonth: ReadonlyArray<number> | null;
}

export class CronParseError extends Error {
  constructor(message: string) {
    super(`cron parse error: ${message}`);
    (this as Error & { code: string }).code = 'CRON_PARSE_ERROR';
  }
}

/** Parse a 5-field cron expression. Throws `CronParseError` on invalid input. */
export function parseCron(expression: string): ICronSchedule {
  if (typeof expression !== 'string') throw new CronParseError('expression must be a string');
  const trimmed = expression.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(`expected 5 fields, got ${fields.length} ("${expression}")`);
  }
  const [minuteField, hourField, domField] = fields;
  return {
    expression: trimmed,
    minutes: parseField(minuteField, 0, 59, 'minute'),
    hours: hourField === '*' ? null : parseField(hourField, 0, 23, 'hour'),
    daysOfMonth: domField === '*' ? null : parseField(domField, 1, 31, 'day-of-month'),
  };
}

/** Parse a single cron field. Supports: star, N, N-M, star/N, N,M,... */
function parseField(field: string, min: number, max: number, label: string): ReadonlyArray<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) out.add(i);
      continue;
    }
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const [, base, stepStr] = stepMatch;
      const step = Number.parseInt(stepStr, 10);
      if (!Number.isFinite(step) || step < 1) throw new CronParseError(`invalid step in ${label}: "${part}"`);
      const rangeValues = base === '*' ? rangeList(min, max) : parseRange(base, min, max, label);
      for (let i = 0; i < rangeValues.length; i += step) out.add(rangeValues[i]);
      continue;
    }
    if (part.includes('-')) {
      const values = parseRange(part, min, max, label);
      values.forEach((v) => out.add(v));
      continue;
    }
    const n = Number.parseInt(part, 10);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new CronParseError(`${label} value out of range: "${part}" (expected ${min}-${max})`);
    }
    out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

function parseRange(part: string, min: number, max: number, label: string): ReadonlyArray<number> {
  const [loStr, hiStr] = part.split('-');
  const lo = Number.parseInt(loStr, 10);
  const hi = Number.parseInt(hiStr, 10);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
    throw new CronParseError(`invalid range in ${label}: "${part}"`);
  }
  return rangeList(lo, hi);
}

function rangeList(lo: number, hi: number): ReadonlyArray<number> {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

export interface IShouldFireInput {
  schedule: ICronSchedule;
  /** Candidate fire time (typically `new Date()`). */
  now: Date;
  /** Last fired time (UTC); undefined = never fired. */
  lastFiredAt?: Date;
}

/**
 * Decide whether the schedule should fire at `now`. Returns true if:
 *   - minute matches AND
 *   - (hours === null OR hour matches) AND
 *   - (daysOfMonth === null OR day matches) AND
 *   - either lastFiredAt is missing OR lastFiredAt is strictly before now
 *     (prevents double-fire when called twice in the same minute).
 */
export function shouldFire(input: IShouldFireInput): boolean {
  const { schedule, now } = input;
  if (!schedule.minutes.includes(now.getUTCMinutes())) return false;
  if (schedule.hours !== null && !schedule.hours.includes(now.getUTCHours())) return false;
  if (schedule.daysOfMonth !== null && !schedule.daysOfMonth.includes(now.getUTCDate())) return false;
  if (input.lastFiredAt) {
    const lastMinute = new Date(
      Date.UTC(
        input.lastFiredAt.getUTCFullYear(),
        input.lastFiredAt.getUTCMonth(),
        input.lastFiredAt.getUTCDate(),
        input.lastFiredAt.getUTCHours(),
        input.lastFiredAt.getUTCMinutes()
      )
    ).getTime();
    const nowMinute = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes())
    ).getTime();
    if (lastMinute >= nowMinute) return false;
  }
  return true;
}

/**
 * Compute the next fire time strictly after `after` (default: now).
 * Returns null if no fire time can be computed within 366 days (sanity bound).
 */
export function nextFireAt(schedule: ICronSchedule, after: Date = new Date()): Date | null {
  const start = new Date(after.getTime() + 60_000); // strictly after
  const startMinute = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes())
  );
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const candidate = new Date(startMinute.getTime() + i * 60_000);
    if (shouldFire({ schedule, now: candidate })) return candidate;
  }
  return null;
}

/**
 * Run a list of (name, schedule, handler) tuples and return the names of
 * the handlers that fired. Pure dispatcher: caller controls time + lastFiredAt.
 */
export interface ICronTick {
  name: string;
  schedule: ICronSchedule;
  lastFiredAt?: Date;
  /** Optional async handler; its return value is ignored. */
  handler?: () => void | Promise<void>;
}

export async function runCronTick(input: {
  now: Date;
  jobs: ReadonlyArray<ICronTick>;
}): Promise<{ fired: string[]; results: Record<string, Date> }> {
  const fired: string[] = [];
  const results: Record<string, Date> = {};
  for (const job of input.jobs) {
    if (!shouldFire({ schedule: job.schedule, now: input.now, ...(job.lastFiredAt ? { lastFiredAt: job.lastFiredAt } : {}) })) continue;
    fired.push(job.name);
    results[job.name] = input.now;
    if (job.handler) await job.handler();
  }
  return { fired, results };
}

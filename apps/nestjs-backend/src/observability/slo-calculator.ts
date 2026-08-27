/**
 * Error-budget calculator for Teable OSS SLOs.
 *
 * Reads the SLO shape from `infra/slo/slo-definitions.yaml` (parsed once at
 * module load via the project's existing `js-yaml` dev dep — no new runtime
 * dependency) and exposes a small pure-function API for computing the
 * remaining error budget given a Prometheus query result. The intent is to
 * keep this file dependency-free at the NestJS hot path; it is loaded by the
 * readiness controller (T-12-07) only when an SLO env var is set, so a
 * deployment that has opted out of SLO accounting pays nothing for it.
 *
 * The math follows the Google SRE workbook chapter 5 — "burn rate" is the
 * dimensionless rate at which the SLO is currently consuming the budget.
 * A burn of 1.0 means "we will exhaust the budget in exactly the window
 * length"; a burn of 14.4 means "we will exhaust 1% of the budget in one
 * hour".  Pairing short and long windows (1h/5m and 24h/3d) is what makes
 * the multi-window, multi-burn-rate alerting pattern robust against single-
 * sample spikes while still paging quickly for sustained damage.
 *
 * License: AGPL-3.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

// ----- SLO shape (mirrors infra/slo/slo-definitions.yaml) -----------------

export interface SloEntry {
  id: string;
  service: string;
  description?: string;
  target: number;
  window: string; // e.g. "30d"
  slo_ratio: number;
  error_budget: { fraction: number; [k: string]: unknown };
  alerting_burn: {
    fast: Array<{ window: string; burn: number; severity: 'page' | 'ticket' }>;
    slow: Array<{ window: string; burn: number; severity: 'page' | 'ticket' }>;
  };
}

interface SloDocument {
  apiVersion: string;
  kind: string;
  metadata: { name: string; version: string; [k: string]: unknown };
}

// The YAML is an array of entries, but `js-yaml` will give us an array
// directly when the top-level value is a list — the document wrapper lives
// in `metadata`, so we re-wrap here for type safety.
type SloFile = (SloDocument & { items: SloEntry[] }) | SloEntry[];

const isWrapped = (v: SloFile): v is SloDocument & { items: SloEntry[] } =>
  Array.isArray((v as { items?: unknown }).items);

let cache: Map<string, SloEntry> | null = null;

/**
 * Loads SLO entries from the YAML file. Cached after first read because the
 * definition file does not change at runtime — process restart picks up
 * any change. `path` defaults to `<repo-root>/infra/slo/slo-definitions.yaml`
 * but can be overridden for tests.
 */
export function loadSloEntries(path?: string): Map<string, SloEntry> {
  if (cache) return cache;

  const filePath =
    path ??
    process.env.TEABLE_SLO_DEFINITIONS_PATH ??
    join(process.cwd(), 'infra', 'slo', 'slo-definitions.yaml');

  const raw = readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw) as SloFile;
  const items = isWrapped(parsed) ? parsed.items : parsed;

  cache = new Map(items.map((s) => [s.id, s]));
  return cache;
}

/**
 * Returns the parsed entry for `id` or `undefined`. Used by the readiness
 * controller when wiring SLO summary into /readyz; never throws so a
 * misconfigured SLO file degrades to "no SLO data" rather than taking down
 * the readiness probe.
 */
export function getSlo(id: string): SloEntry | undefined {
  return loadSloEntries().get(id);
}

// ----- Window parsing -----------------------------------------------------

const WINDOW_RE = /^(\d+)([smhd])$/;

/** Parses a window string like "30d" into seconds. Returns undefined on bad input. */
export function parseWindow(window: string): number | undefined {
  const m = WINDOW_RE.exec(window);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return undefined;
  }
}

// ----- Budget math --------------------------------------------------------

export interface BudgetSnapshot {
  slo_id: string;
  target: number;
  window_seconds: number;
  /** Total allowed bad events in the window. */
  budget_total: number;
  /** Bad events observed so far in the window. */
  bad_events: number;
  /** budget_total - bad_events; never negative. */
  budget_remaining: number;
  /** 0..1; 1 means budget fully intact, 0 means exhausted. */
  budget_remaining_ratio: number;
  /**
   * Burn rate: (bad_events / elapsed_seconds) / (budget_total / window_seconds).
   * 1.0 = consuming at the sustainable rate; >1 = burning faster than the
   * SLO can tolerate.
   */
  burn_rate: number;
  /** Shortest burn window that has crossed the alert threshold, or undefined. */
  alerting: { severity: 'page' | 'ticket'; window: string; burn: number } | undefined;
}

/**
 * Compute the error-budget snapshot for a single SLO given the SLI samples
 * already in memory. The caller is responsible for fetching the raw
 * `good_events` and `total_events` counters from Prometheus — keeping the
 * math pure means tests do not need to spin up a fake Prom.
 *
 * @param slo      entry from slo-definitions.yaml
 * @param good     good events observed in the window
 * @param total    total events observed in the window
 * @param elapsed  how much of the window has actually elapsed (seconds).
 *                 Defaults to the full window length so callers that only
 *                 have aggregate counters still get a sane answer.
 */
export function computeBudget(
  slo: SloEntry,
  good: number,
  total: number,
  elapsed?: number
): BudgetSnapshot {
  const window_seconds = parseWindow(slo.window) ?? 30 * 86400;
  const bad = Math.max(0, total - good);
  const budget_total = Math.max(0, total * (1 - slo.slo_ratio));
  const budget_remaining = Math.max(0, budget_total - bad);
  const budget_remaining_ratio = budget_total === 0 ? 1 : budget_remaining / budget_total;

  // Burn rate is the ratio of observed burn to sustainable burn.
  const elapsedSeconds = elapsed ?? window_seconds;
  const observedRate = elapsedSeconds === 0 ? 0 : bad / elapsedSeconds;
  const sustainableRate = window_seconds === 0 ? 0 : budget_total / window_seconds;
  const burn_rate = sustainableRate === 0 ? 0 : observedRate / sustainableRate;

  // Find the lowest-severity threshold that has been crossed. Fast first
  // because a page-level burn must win over a ticket-level one if both
  // are over threshold.
  const allThresholds = [...slo.alerting_burn.fast, ...slo.alerting_burn.slow];
  let alerting: BudgetSnapshot['alerting'];
  for (const t of allThresholds) {
    if (burn_rate >= t.burn) {
      alerting = { severity: t.severity, window: t.window, burn: t.burn };
      break;
    }
  }

  return {
    slo_id: slo.id,
    target: slo.target,
    window_seconds,
    budget_total,
    bad_events: bad,
    budget_remaining,
    budget_remaining_ratio,
    burn_rate,
    alerting,
  };
}

/**
 * Computes snapshots for every loaded SLO given a Prometheus query function.
 * Returns an empty array (never throws) so a partial outage of the metric
 * backend cannot take down the readiness probe.
 */
export async function computeAllBudgets(
  query: (sliId: string) => Promise<{ good: number; total: number }>
): Promise<BudgetSnapshot[]> {
  const entries = loadSloEntries();
  const out: BudgetSnapshot[] = [];
  for (const [id, slo] of entries) {
    try {
      const { good, total } = await query(id);
      out.push(computeBudget(slo, good, total));
    } catch {
      // Per-SLO failure — keep going so one bad SLO doesn't hide the rest.
    }
  }
  return out;
}

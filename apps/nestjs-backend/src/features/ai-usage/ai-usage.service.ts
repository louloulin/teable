/**
 * AI usage breakdown (model × action) — Stage 29.
 *
 * Pure helpers for collapsing a stream of credit events into per-bucket
 * counters, plus policy resolution for per-model caps.
 *
 * No Prisma here — service keeps the math testable without a DB.
 */

import { monthBucketFromDate } from '../ai-credit/ai-credit.service';
import type {
  IAiCreditGrantPolicy,
  IAiUsageBucket,
  IAiUsageSummary,
  IRecordUsageInput,
} from './ai-usage.types';

/** Normalize model name: trim + lowercase. Empty string → "unknown". */
export function normalizeModel(model: string): string {
  const trimmed = (model ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

/** Normalize action name: trim + lowercase. Empty string → "unknown". */
export function normalizeAction(action: string): string {
  const trimmed = (action ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

/** Compute the unique key for (org, model, action, month). */
export function bucketKey(input: {
  organizationId: string;
  model: string;
  action: string;
  monthBucket: string;
}): string {
  return [input.organizationId, input.model, input.action, input.monthBucket].join('');
}

/** Apply a single record to an existing bucket. */
export function applyToBucket(
  bucket: IAiUsageBucket,
  credits: number,
  eventCount = 1
): IAiUsageBucket {
  return {
    ...bucket,
    credits: bucket.credits + credits,
    eventCount: bucket.eventCount + eventCount,
    updatedTime: new Date(),
  };
}

/** Fold a stream of records into buckets. */
export function foldRecords(records: IRecordUsageInput[]): IAiUsageBucket[] {
  const map = new Map<string, IAiUsageBucket>();
  const now = new Date();
  for (const r of records) {
    const monthBucket = r.monthBucket ?? monthBucketFromDate(now);
    const model = normalizeModel(r.model);
    const action = normalizeAction(r.action);
    const key = bucketKey({ organizationId: r.organizationId, model, action, monthBucket });
    const existing = map.get(key);
    if (existing) {
      map.set(key, applyToBucket(existing, r.credits, 1));
    } else {
      map.set(key, {
        id: `aub_${key}`,
        organizationId: r.organizationId,
        model,
        action,
        credits: r.credits,
        eventCount: 1,
        monthBucket,
        updatedTime: now,
      });
    }
  }
  return Array.from(map.values());
}

/** Roll a flat bucket list into a summary (totals + by-model + by-action). */
export function summarize(input: {
  organizationId: string;
  monthBucket: string;
  buckets: IAiUsageBucket[];
}): IAiUsageSummary {
  const filtered = input.buckets.filter(
    (b) => b.organizationId === input.organizationId && b.monthBucket === input.monthBucket
  );
  const modelMap = new Map<string, { model: string; credits: number; events: number }>();
  const actionMap = new Map<string, { action: string; credits: number; events: number }>();
  let total = 0;
  for (const b of filtered) {
    total += b.credits;
    const m = modelMap.get(b.model) ?? { model: b.model, credits: 0, events: 0 };
    m.credits += b.credits;
    m.events += b.eventCount;
    modelMap.set(b.model, m);
    const a = actionMap.get(b.action) ?? { action: b.action, credits: 0, events: 0 };
    a.credits += b.credits;
    a.events += b.eventCount;
    actionMap.set(b.action, a);
  }
  return {
    organizationId: input.organizationId,
    monthBucket: input.monthBucket,
    total,
    byModel: Array.from(modelMap.values()).sort((a, b) => b.credits - a.credits),
    byAction: Array.from(actionMap.values()).sort((a, b) => b.credits - a.credits),
  };
}

/** Decide whether a (model, action) record would breach the per-model cap. */
export function exceedsModelCap(input: {
  bucket: IAiUsageBucket | null;
  estimatedCredits: number;
  perModelCap: Record<string, number>;
}): boolean {
  const cap = input.perModelCap[input.bucket?.model ?? ''];
  if (typeof cap !== 'number') return false;
  const used = input.bucket?.credits ?? 0;
  return used + input.estimatedCredits > cap;
}

/** Parse the per-model cap JSON column. Returns {} on invalid/empty. */
export function parsePerModelCap(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && v >= 0) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Coerce a policy row into the typed shape. */
export function coercePolicy(row: {
  organizationId: string;
  monthlyLimit: number;
  carryCap: number;
  perModelCapJson: string | null;
}): IAiCreditGrantPolicy {
  return {
    organizationId: row.organizationId,
    monthlyLimit: row.monthlyLimit,
    carryCap: row.carryCap,
    perModelCap: parsePerModelCap(row.perModelCapJson),
  };
}

/** Merge incoming per-model cap (e.g. from API) with defaults, lowercased. */
export function mergePerModelCap(
  input: Record<string, number> | null | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (typeof v !== 'number' || v < 0) continue;
    const key = k.trim().toLowerCase();
    if (!key) continue;
    out[key] = v;
  }
  return out;
}

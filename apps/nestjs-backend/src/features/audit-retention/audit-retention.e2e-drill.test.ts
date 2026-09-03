/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Audit retention end-to-end drill (R53).
 *
 * Validates the retention pure helpers end-to-end without spinning up the
 * full Nest container: tier classification, sweep planning, batch sizing,
 * storage estimation, and job lifecycle.
 *
 * License: AGPL-3.0
 */

import { describe, expect, it } from 'vitest';

import {
  batchEvents,
  decideTier,
  defaultHotDays,
  estimateStorageBytes,
  finishJob,
  planSweep,
  startJob,
  validatePolicy,
} from './audit-retention.service';
import { MAX_BATCH } from './audit-retention.types';
import type { IAuditEvent, IAuditRetentionPolicy } from './audit-retention.types';

const NOW = new Date('2026-09-03T12:00:00Z');

function daysAgo(n: number, base: Date = NOW): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function mkEvent(over: Partial<IAuditEvent> = {}): IAuditEvent {
  return {
    id: over.id ?? `evt-${Math.random().toString(36).slice(2, 8)}`,
    orgId: over.orgId ?? 'org1',
    baseId: over.baseId ?? 'base1',
    action: over.action ?? 'row.create',
    actorId: over.actorId ?? 'user1',
    createdAt: over.createdAt ?? daysAgo(1),
    payload: over.payload ?? '{}',
  };
}

const basePolicy: IAuditRetentionPolicy = {
  orgId: 'org1',
  hotDays: 30,
  coldDays: 365,
  coldTarget: 's3',
  coldBucket: 'audit-cold',
  coldPrefix: 'org1/',
  redactPii: true,
  updatedAt: NOW.toISOString(),
  updatedBy: 'admin',
};

describe('Audit retention — tier decision (R53)', () => {
  it('returns hot for events newer than hotDays', () => {
    const d = decideTier({ event: mkEvent({ createdAt: daysAgo(5) }), policy: basePolicy, now: NOW.toISOString() });
    expect(d.tier).toBe('hot');
    expect(d.daysToNext).toBeGreaterThan(0);
  });

  it('treats exactly hotDays ago as still hot (inclusive boundary)', () => {
    const d = decideTier({ event: mkEvent({ createdAt: daysAgo(30) }), policy: basePolicy, now: NOW.toISOString() });
    expect(d.tier).toBe('hot');
  });

  it('returns cold for events older than hotDays but within coldDays', () => {
    const d = decideTier({ event: mkEvent({ createdAt: daysAgo(31) }), policy: basePolicy, now: NOW.toISOString() });
    expect(d.tier).toBe('cold');
  });

  it('treats exactly coldDays ago as still cold (inclusive boundary)', () => {
    const d = decideTier({ event: mkEvent({ createdAt: daysAgo(365) }), policy: basePolicy, now: NOW.toISOString() });
    expect(d.tier).toBe('cold');
  });

  it('returns purged for events older than coldDays', () => {
    const d = decideTier({ event: mkEvent({ createdAt: daysAgo(400) }), policy: basePolicy, now: NOW.toISOString() });
    expect(d.tier).toBe('purged');
    expect(d.daysToNext).toBe(0);
  });
});

describe('Audit retention — sweep planning', () => {
  it('planSweep returns the canonical { promote, purge, keepHot, keepCold } shape', () => {
    const events: IAuditEvent[] = [
      mkEvent({ id: 'e1', createdAt: daysAgo(1) }),
      mkEvent({ id: 'e2', createdAt: daysAgo(45) }),
      mkEvent({ id: 'e3', createdAt: daysAgo(400) }),
    ];
    const plan = planSweep({ events, policy: basePolicy, now: NOW.toISOString() });
    expect(plan.keepHot).toBe(1);
    expect(plan.keepCold).toBe(1);
    expect(plan.promote).toEqual(['e2']);
    expect(plan.purge).toEqual(['e3']);
  });

  it('planSweep returns zero shape for empty input', () => {
    const plan = planSweep({ events: [], policy: basePolicy, now: NOW.toISOString() });
    expect(plan).toEqual({ promote: [], purge: [], keepHot: 0, keepCold: 0 });
  });
});

describe('Audit retention — batching', () => {
  it('batchEvents keeps small lists as a single batch', () => {
    const events = Array.from({ length: 3 }, (_, i) => mkEvent({ id: `e${i}` }));
    const batches = batchEvents(events);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it('batchEvents respects MAX_BATCH ceiling (event at exactly MAX_BATCH is single batch)', () => {
    const events = Array.from({ length: MAX_BATCH }, (_, i) => mkEvent({ id: `e${i}` }));
    const batches = batchEvents(events);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(MAX_BATCH);
  });

  it('batchEvents splits events > MAX_BATCH into multiple batches', () => {
    const events = Array.from({ length: MAX_BATCH + 10 }, (_, i) => mkEvent({ id: `e${i}` }));
    const batches = batchEvents(events);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(MAX_BATCH);
    expect(batches[1]).toHaveLength(10);
  });

  it('batchEvents handles empty input', () => {
    expect(batchEvents([])).toEqual([[]]);
  });
});

describe('Audit retention — storage estimate', () => {
  it('estimateStorageBytes is monotone in count for the same tier', () => {
    const a = estimateStorageBytes({ tier: 'hot', count: 100 });
    const b = estimateStorageBytes({ tier: 'hot', count: 200 });
    expect(b).toBeGreaterThan(a);
    expect(b).toBe(a * 2);
  });

  it('cold storage cost is half of hot (compression)', () => {
    const hot = estimateStorageBytes({ tier: 'hot', count: 1000 });
    const cold = estimateStorageBytes({ tier: 'cold', count: 1000 });
    expect(cold).toBe(hot / 2);
  });

  it('zero count yields zero bytes', () => {
    expect(estimateStorageBytes({ tier: 'hot', count: 0 })).toBe(0);
    expect(estimateStorageBytes({ tier: 'cold', count: 0 })).toBe(0);
  });
});

describe('Audit retention — job lifecycle', () => {
  it('startJob initializes a running job with startedAt + zero counters', () => {
    const job = startJob({ id: 'job1', orgId: 'org1', now: NOW.toISOString() });
    expect(job.status).toBe('running');
    expect(job.scanned).toBe(0);
    expect(job.startedAt).toBe(NOW.toISOString());
    expect(job.finishedAt).toBeNull();
    expect(job.promotedToCold).toBe(0);
    expect(job.purged).toBe(0);
  });

  it('finishJob transitions running job to done with full metrics', () => {
    const job = startJob({ id: 'job1', orgId: 'org1', now: NOW.toISOString() });
    const finished = finishJob({
      job,
      status: 'done',
      scanned: 123,
      promoted: 50,
      purged: 10,
      now: NOW.toISOString(),
    });
    expect(finished.status).toBe('done');
    expect(finished.scanned).toBe(123);
    expect(finished.promotedToCold).toBe(50);
    expect(finished.purged).toBe(10);
    expect(finished.finishedAt).toBe(NOW.toISOString());
  });

  it('finishJob records failure with status=failed + lastError', () => {
    const job = startJob({ id: 'job1', orgId: 'org1', now: NOW.toISOString() });
    const finished = finishJob({
      job,
      status: 'failed',
      scanned: 0,
      promoted: 0,
      purged: 0,
      error: 'connection lost',
      now: NOW.toISOString(),
    });
    expect(finished.status).toBe('failed');
    expect(finished.lastError).toBe('connection lost');
  });
});

describe('Audit retention — end-to-end sweep drill (R53 E2E)', () => {
  it('drills 50 events through planSweep + batch + tier classification + job lifecycle', () => {
    const events: IAuditEvent[] = [];
    for (let i = 1; i <= 20; i++) events.push(mkEvent({ id: `hot-${i}`, createdAt: daysAgo(i) }));
    for (let i = 45; i <= 64; i++) events.push(mkEvent({ id: `cold-${i}`, createdAt: daysAgo(i) }));
    for (let i = 400; i <= 409; i++) events.push(mkEvent({ id: `purged-${i}`, createdAt: daysAgo(i) }));

    const plan = planSweep({ events, policy: basePolicy, now: NOW.toISOString() });
    expect(plan.keepHot).toBe(20);
    expect(plan.keepCold).toBe(20);
    expect(plan.promote).toHaveLength(20);
    expect(plan.purge).toHaveLength(10);

    const batches = batchEvents(events);
    expect(batches).toHaveLength(1); // 50 < MAX_BATCH (5000)

    const job = startJob({ id: 'sweep-1', orgId: 'org1', now: NOW.toISOString() });
    expect(job.status).toBe('running');

    const finished = finishJob({
      job,
      status: 'done',
      scanned: events.length,
      promoted: plan.promote.length,
      purged: plan.purge.length,
      now: NOW.toISOString(),
    });
    expect(finished.status).toBe('done');
    expect(finished.scanned).toBe(50);
    expect(finished.promotedToCold).toBe(20);
    expect(finished.purged).toBe(10);
  });

  it('rejects malformed policies (negative hotDays)', () => {
    const bad: IAuditRetentionPolicy = { ...basePolicy, hotDays: -1 };
    const err = validatePolicy(bad);
    expect(err).not.toBeNull();
    expect(err).toMatch(/hotDays/i);
  });

  it('rejects policies where coldDays < hotDays', () => {
    const bad: IAuditRetentionPolicy = { ...basePolicy, hotDays: 30, coldDays: 10 };
    const err = validatePolicy(bad);
    expect(err).not.toBeNull();
    expect(err).toMatch(/coldDays/i);
  });
});

describe('Audit retention — default policy helpers', () => {
  it('defaultHotDays returns a positive number', () => {
    expect(defaultHotDays()).toBeGreaterThan(0);
  });

  it('defaultHotDays respects opts override', () => {
    expect(defaultHotDays({ defaultHotDays: 7 })).toBe(7);
  });
});

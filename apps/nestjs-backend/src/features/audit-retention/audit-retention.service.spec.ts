import {
  batchEvents,
  decideTier,
  defaultColdDays,
  defaultHotDays,
  estimateStorageBytes,
  finishJob,
  isStorageTarget,
  maxColdDays,
  maxHotDays,
  normalizePolicy,
  planSweep,
  startJob,
  suggestPolicyForPlan,
  validatePolicy,
} from './audit-retention.service';
import type { IAuditEvent, IAuditRetentionPolicy } from './audit-retention.types';
import { MAX_BATCH, MAX_COLD_DAYS, MAX_HOT_DAYS, STORAGE_TARGETS } from './audit-retention.types';

const basePolicy = (over: Partial<IAuditRetentionPolicy> = {}): IAuditRetentionPolicy => ({
  orgId: 'o1',
  hotDays: 90,
  coldDays: 365,
  coldTarget: 's3',
  coldBucket: 'audit',
  coldPrefix: 'events/',
  redactPii: false,
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'admin',
  ...over,
});

const baseEvent = (over: Partial<IAuditEvent> = {}): IAuditEvent => ({
  id: 'e1',
  orgId: 'o1',
  baseId: 'b1',
  action: 'row.create',
  actorId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  payload: '{}',
  ...over,
});

describe('audit-retention.isStorageTarget', () => {
  it('accepts canonical', () => {
    expect(isStorageTarget('s3')).toBe(true);
    expect(isStorageTarget('oss')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isStorageTarget('dropbox')).toBe(false);
  });
});

describe('audit-retention.defaults & caps', () => {
  it('returns default hot / cold', () => {
    expect(defaultHotDays()).toBe(90);
    expect(defaultColdDays()).toBe(365);
  });
  it('returns hard caps', () => {
    expect(maxHotDays()).toBe(MAX_HOT_DAYS);
    expect(maxColdDays()).toBe(MAX_COLD_DAYS);
  });
  it('STORAGE_TARGETS has 4 entries', () => {
    expect(STORAGE_TARGETS.length).toBe(4);
  });
});

describe('audit-retention.validatePolicy', () => {
  it('passes a healthy policy', () => {
    expect(validatePolicy(basePolicy())).toBeNull();
  });
  it('rejects missing orgId', () => {
    expect(validatePolicy(basePolicy({ orgId: '' }))).toContain('orgId');
  });
  it('rejects hotDays out of range', () => {
    expect(validatePolicy(basePolicy({ hotDays: 0 }))).toContain('hotDays');
    expect(validatePolicy(basePolicy({ hotDays: MAX_HOT_DAYS + 1 }))).toContain('hotDays');
  });
  it('rejects coldDays < hotDays', () => {
    expect(validatePolicy(basePolicy({ hotDays: 100, coldDays: 50 }))).toContain('coldDays');
  });
  it('rejects unknown storage target', () => {
    expect(validatePolicy(basePolicy({ coldTarget: 'drive' as never }))).toContain('coldTarget');
  });
  it('rejects missing bucket when target set', () => {
    expect(validatePolicy(basePolicy({ coldBucket: null }))).toContain('coldBucket');
  });
});

describe('audit-retention.normalizePolicy', () => {
  it('clamps hot days', () => {
    const p = normalizePolicy({ orgId: 'o1', hotDays: 9999 });
    expect(p.hotDays).toBe(MAX_HOT_DAYS);
  });
  it('defaults redactPii false', () => {
    const p = normalizePolicy({ orgId: 'o1' });
    expect(p.redactPii).toBe(false);
  });
});

describe('audit-retention.decideTier', () => {
  it('hot when within hot window', () => {
    const d = decideTier({
      policy: basePolicy({ hotDays: 30 }),
      event: baseEvent({ createdAt: '2026-01-01T00:00:00Z' }),
      now: '2026-01-15T00:00:00Z',
    });
    expect(d.tier).toBe('hot');
    expect(d.daysToNext).toBeGreaterThan(0);
  });
  it('cold when between hot and cold', () => {
    const d = decideTier({
      policy: basePolicy({ hotDays: 30, coldDays: 365 }),
      event: baseEvent({ createdAt: '2025-06-01T00:00:00Z' }),
      now: '2026-01-01T00:00:00Z',
    });
    expect(d.tier).toBe('cold');
  });
  it('purged when past cold', () => {
    const d = decideTier({
      policy: basePolicy({ hotDays: 30, coldDays: 60 }),
      event: baseEvent({ createdAt: '2020-01-01T00:00:00Z' }),
      now: '2026-01-01T00:00:00Z',
    });
    expect(d.tier).toBe('purged');
  });
});

describe('audit-retention.planSweep', () => {
  it('counts each tier', () => {
    const plan = planSweep({
      policy: basePolicy({ hotDays: 30, coldDays: 365 }),
      events: [
        baseEvent({ id: 'a', createdAt: '2026-01-01T00:00:00Z' }),
        baseEvent({ id: 'b', createdAt: '2025-06-01T00:00:00Z' }),
        baseEvent({ id: 'c', createdAt: '2020-01-01T00:00:00Z' }),
      ],
      now: '2026-01-15T00:00:00Z',
    });
    expect(plan.keepHot).toBe(1);
    expect(plan.keepCold).toBe(1);
    expect(plan.promote).toEqual(['b']);
    expect(plan.purge).toEqual(['c']);
  });
});

describe('audit-retention.batchEvents', () => {
  it('returns single batch under cap', () => {
    expect(batchEvents([baseEvent()]).length).toBe(1);
  });
  it('splits over cap', () => {
    const big = Array.from({ length: MAX_BATCH + 100 }, (_, i) => baseEvent({ id: `e${i}` }));
    const out = batchEvents(big);
    expect(out.length).toBe(2);
    expect(out[0]?.length).toBe(MAX_BATCH);
    expect(out[1]?.length).toBe(100);
  });
});

describe('audit-retention.estimateStorageBytes', () => {
  it('hot tier', () => {
    expect(estimateStorageBytes({ tier: 'hot', count: 10 })).toBe(5120);
  });
  it('cold tier', () => {
    expect(estimateStorageBytes({ tier: 'cold', count: 10 })).toBe(2560);
  });
});

describe('audit-retention.startJob / finishJob', () => {
  it('starts with running status', () => {
    const j = startJob({ id: 'j1', orgId: 'o1' });
    expect(j.status).toBe('running');
    expect(j.startedAt).toBeTruthy();
  });
  it('finishes with metrics', () => {
    const j = startJob({ id: 'j1', orgId: 'o1' });
    const done = finishJob({ job: j, status: 'done', scanned: 100, promoted: 50, purged: 10 });
    expect(done.status).toBe('done');
    expect(done.scanned).toBe(100);
    expect(done.promotedToCold).toBe(50);
    expect(done.purged).toBe(10);
  });
  it('finishes with error', () => {
    const j = startJob({ id: 'j1', orgId: 'o1' });
    const f = finishJob({
      job: j,
      status: 'failed',
      scanned: 0,
      promoted: 0,
      purged: 0,
      error: 's3 unreachable',
    });
    expect(f.lastError).toBe('s3 unreachable');
  });
});

describe('audit-retention.suggestPolicyForPlan', () => {
  it('free keeps default 90 hot', () => {
    const p = suggestPolicyForPlan({ orgId: 'o1', plan: 'free' });
    expect(p.hotDays).toBe(90);
    expect(p.coldTarget).toBeNull();
  });
  it('enterprise gets full 7 years cold + s3', () => {
    const p = suggestPolicyForPlan({ orgId: 'o1', plan: 'enterprise' });
    expect(p.coldDays).toBe(MAX_COLD_DAYS);
    expect(p.coldTarget).toBe('s3');
  });
  it('pro sets 180 hot', () => {
    const p = suggestPolicyForPlan({ orgId: 'o1', plan: 'pro' });
    expect(p.hotDays).toBe(180);
  });
});

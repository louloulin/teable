import {
  arbitrateWrite,
  detectSplitBrain,
  enqueueReplay,
  fleetSkew,
  isClockWithinSkew,
  isLeaseLive,
  isSplitBrain,
  isValidRegionId,
  isValidResourceKey,
  markReplayed,
  pruneQueue,
  readyReplays,
  recordConflict,
  resolveResolution,
  resolveTtl,
  validateRequest,
} from './multi-region-arbitration.service';
import type { IRegionClock, IWriteLease, IWriteRequest } from './multi-region-arbitration.types';
import {
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_MAX_SKEW_MS,
  MAX_LEASE_TTL_MS,
  MAX_REPLAY_QUEUE_DEPTH,
  MAX_RESOURCE_KEY_LENGTH,
} from './multi-region-arbitration.types';

const baseRequest = (over: Partial<IWriteRequest> = {}): IWriteRequest => ({
  resourceKey: 'row:tbl1:rec1',
  regionId: 'us-east-1',
  holderId: 'writer-1',
  baseVersion: 0,
  ttlMs: DEFAULT_LEASE_TTL_MS,
  ...over,
});

const baseLease = (over: Partial<IWriteLease> = {}): IWriteLease => ({
  resourceKey: 'row:tbl1:rec1',
  regionId: 'us-east-1',
  holderId: 'writer-1',
  acquiredAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T00:00:05Z',
  generation: 1,
  state: 'active',
  ...over,
});

describe('multi-region-arbitration.isValidResourceKey', () => {
  it('accepts alphanumerics and separators', () => {
    expect(isValidResourceKey('row:tbl1:rec1')).toBe(true);
  });
  it('rejects empty', () => {
    expect(isValidResourceKey('')).toBe(false);
  });
  it('rejects overlong keys', () => {
    expect(isValidResourceKey('a'.repeat(MAX_RESOURCE_KEY_LENGTH + 1))).toBe(false);
  });
  it('rejects whitespace', () => {
    expect(isValidResourceKey('row tbl1 rec1')).toBe(false);
  });
});

describe('multi-region-arbitration.isValidRegionId', () => {
  it('accepts canonical ids', () => {
    expect(isValidRegionId('us-east-1')).toBe(true);
    expect(isValidRegionId('eu-central-2')).toBe(true);
  });
  it('rejects malformed ids', () => {
    expect(isValidRegionId('US-EAST-1')).toBe(false);
    expect(isValidRegionId('east')).toBe(false);
    expect(isValidRegionId('')).toBe(false);
  });
});

describe('multi-region-arbitration.fleetSkew', () => {
  it('returns 0 for empty fleet', () => {
    expect(fleetSkew([])).toBe(0);
  });
  it('returns max - min skew', () => {
    const fleet: IRegionClock[] = [
      { regionId: 'us-east-1', now: '2026-01-01T00:00:00Z', skewMs: 50 },
      { regionId: 'eu-central-1', now: '2026-01-01T00:00:00Z', skewMs: 250 },
      { regionId: 'ap-southeast-1', now: '2026-01-01T00:00:00Z', skewMs: 100 },
    ];
    expect(fleetSkew(fleet)).toBe(200);
  });
});

describe('multi-region-arbitration.isClockWithinSkew', () => {
  it('passes within budget', () => {
    const a: IRegionClock = { regionId: 'a', now: '', skewMs: 100 };
    const b: IRegionClock = { regionId: 'b', now: '', skewMs: 200 };
    expect(isClockWithinSkew(a, b, 150)).toBe(true);
  });
  it('fails beyond budget', () => {
    const a: IRegionClock = { regionId: 'a', now: '', skewMs: 100 };
    const b: IRegionClock = { regionId: 'b', now: '', skewMs: 500 };
    expect(isClockWithinSkew(a, b, 150)).toBe(false);
  });
});

describe('multi-region-arbitration.isSplitBrain', () => {
  it('triggers when fleet skew > limit', () => {
    const fleet: IRegionClock[] = [
      { regionId: 'a', now: '', skewMs: 0 },
      { regionId: 'b', now: '', skewMs: 5_000 },
    ];
    expect(isSplitBrain(fleet, DEFAULT_MAX_SKEW_MS)).toBe(true);
  });
});

describe('multi-region-arbitration.resolveTtl', () => {
  it('caps requested ttl at the max', () => {
    expect(resolveTtl(baseRequest({ ttlMs: MAX_LEASE_TTL_MS + 1 }), {})).toBe(MAX_LEASE_TTL_MS);
  });
  it('falls back to default', () => {
    expect(resolveTtl(baseRequest({ ttlMs: 0 }), {})).toBe(DEFAULT_LEASE_TTL_MS);
  });
  it('honors option default when request omits', () => {
    const req = baseRequest();
    delete (req as Partial<IWriteRequest>).ttlMs;
    expect(resolveTtl(req, { defaultTtlMs: 1234 })).toBe(1234);
  });
});

describe('multi-region-arbitration.resolveResolution', () => {
  it('returns the default when unset', () => {
    expect(resolveResolution({})).toBe('last-writer-wins');
  });
  it('returns the requested strategy', () => {
    expect(resolveResolution({ resolution: 'first-writer-wins' })).toBe('first-writer-wins');
  });
});

describe('multi-region-arbitration.validateRequest', () => {
  it('passes a healthy request', () => {
    expect(validateRequest(baseRequest())).toBeNull();
  });
  it('rejects bad region', () => {
    expect(validateRequest(baseRequest({ regionId: 'home' }))).toContain('regionId');
  });
  it('rejects bad version', () => {
    expect(validateRequest(baseRequest({ baseVersion: -1 }))).toContain('baseVersion');
  });
  it('rejects missing holderId', () => {
    expect(validateRequest(baseRequest({ holderId: '' }))).toContain('holderId');
  });
});

describe('multi-region-arbitration.isLeaseLive', () => {
  it('treats active leases with future expiry as live', () => {
    expect(isLeaseLive(baseLease(), '2026-01-01T00:00:04Z')).toBe(true);
  });
  it('treats expired leases as dead', () => {
    expect(isLeaseLive(baseLease(), '2026-01-01T00:00:06Z')).toBe(false);
  });
  it('treats revoked leases as dead', () => {
    expect(isLeaseLive(baseLease({ state: 'revoked' }), '2026-01-01T00:00:01Z')).toBe(false);
  });
});

describe('multi-region-arbitration.arbitrateWrite', () => {
  it('admits when no lease exists', () => {
    const r = arbitrateWrite({ request: baseRequest(), existingLease: null });
    expect(r.kind).toBe('admit');
    if (r.kind === 'admit') {
      expect(r.lease.regionId).toBe('us-east-1');
      expect(r.lease.generation).toBe(1);
    }
  });
  it('admits when the same region extends', () => {
    const r = arbitrateWrite({
      request: baseRequest({ now: '2026-01-01T00:00:02Z' }),
      existingLease: baseLease(),
    });
    expect(r.kind).toBe('admit');
    if (r.kind === 'admit') {
      expect(r.lease.generation).toBe(2);
    }
  });
  it('rejects when another region holds a live lease', () => {
    const r = arbitrateWrite({
      request: baseRequest({
        regionId: 'eu-central-1',
        now: '2026-01-01T00:00:02Z',
      }),
      existingLease: baseLease({ regionId: 'us-east-1' }),
    });
    expect(r.kind).toBe('reject');
    if (r.kind === 'reject') {
      expect(r.reason).toBe('lease-held-elsewhere');
      expect(r.holderRegion).toBe('us-east-1');
    }
  });
  it('admits after lease expires', () => {
    const r = arbitrateWrite({
      request: baseRequest({
        regionId: 'eu-central-1',
        now: '2026-01-01T00:01:00Z',
      }),
      existingLease: baseLease({ regionId: 'us-east-1' }),
    });
    expect(r.kind).toBe('admit');
  });
  it('rejects invalid request', () => {
    const r = arbitrateWrite({
      request: baseRequest({ resourceKey: '' }),
      existingLease: null,
    });
    expect(r.kind).toBe('reject');
    if (r.kind === 'reject') {
      expect(r.reason).toBe('invalid-request');
    }
  });
  it('rejects wildly stale baseVersion', () => {
    const r = arbitrateWrite({
      request: baseRequest({ baseVersion: 2_000_000 }),
      existingLease: null,
    });
    expect(r.kind).toBe('reject');
    if (r.kind === 'reject') {
      expect(r.reason).toBe('invalid-request');
    }
  });
});

describe('multi-region-arbitration.detectSplitBrain', () => {
  it('flags when fleet skew exceeds budget', () => {
    const fleet: IRegionClock[] = [
      { regionId: 'a', now: '', skewMs: 0 },
      { regionId: 'b', now: '', skewMs: 5_000 },
    ];
    const r = detectSplitBrain({ fleet });
    expect(r.split).toBe(true);
    expect(r.skewMs).toBe(5_000);
    expect(r.threshold).toBe(DEFAULT_MAX_SKEW_MS);
  });
  it('passes when within budget', () => {
    const fleet: IRegionClock[] = [
      { regionId: 'a', now: '', skewMs: 0 },
      { regionId: 'b', now: '', skewMs: 200 },
    ];
    const r = detectSplitBrain({ fleet, options: { maxSkewMs: 1_000 } });
    expect(r.split).toBe(false);
  });
});

describe('multi-region-arbitration.recordConflict', () => {
  it('captures winner and loser metadata', () => {
    const c = recordConflict({
      resourceKey: 'row:tbl1:rec1',
      winnerRegion: 'us-east-1',
      loserRegion: 'eu-central-1',
      winnerVersion: 5,
      loserVersion: 4,
      resolution: 'first-writer-wins',
    });
    expect(c.winnerRegion).toBe('us-east-1');
    expect(c.loserVersion).toBe(4);
    expect(c.resolution).toBe('first-writer-wins');
    expect(c.replayedAt).toBeNull();
  });
});

describe('multi-region-arbitration.enqueueReplay', () => {
  it('appends a new entry', () => {
    const { entry, queue } = enqueueReplay({
      conflictId: 'c1',
      regionId: 'eu-central-1',
      payload: { x: 1 },
      queue: [],
    });
    expect(queue.length).toBe(1);
    expect(entry.attempts).toBe(0);
    expect(entry.conflictId).toBe('c1');
  });
  it('computes exponential backoff', () => {
    const { entry } = enqueueReplay({
      conflictId: 'c1',
      regionId: 'eu-central-1',
      payload: {},
      queue: [],
      attempt: 3,
      now: '2026-01-01T00:00:00Z',
    });
    const delay = new Date(entry.nextAttemptAt).getTime() - new Date(entry.enqueuedAt).getTime();
    expect(delay).toBeGreaterThan(0);
  });
  it('caps the queue depth', () => {
    expect(() =>
      enqueueReplay({
        conflictId: 'c1',
        regionId: 'eu-central-1',
        payload: {},
        queue: Array.from({ length: MAX_REPLAY_QUEUE_DEPTH }),
      })
    ).toThrow();
  });
});

describe('multi-region-arbitration.readyReplays', () => {
  it('returns entries past their nextAttemptAt', () => {
    const queue = [
      {
        id: 'r1',
        conflictId: 'c1',
        regionId: 'eu-central-1',
        payload: {},
        enqueuedAt: '2026-01-01T00:00:00Z',
        attempts: 0,
        nextAttemptAt: '2026-01-01T00:00:01Z',
      },
      {
        id: 'r2',
        conflictId: 'c2',
        regionId: 'eu-central-1',
        payload: {},
        enqueuedAt: '2026-01-01T00:00:00Z',
        attempts: 0,
        nextAttemptAt: '2026-01-01T00:00:10Z',
      },
    ];
    const ready = readyReplays(queue, '2026-01-01T00:00:05Z');
    expect(ready.length).toBe(1);
    expect(ready[0]?.id).toBe('r1');
  });
});

describe('multi-region-arbitration.markReplayed', () => {
  it('stamps the replayedAt field', () => {
    const r = markReplayed(
      {
        id: 'c1',
        resourceKey: 'r',
        winnerRegion: 'a',
        loserRegion: 'b',
        winnerVersion: 1,
        loserVersion: 0,
        resolution: 'last-writer-wins',
        detectedAt: '',
        replayedAt: null,
      },
      '2026-01-01T00:00:00Z'
    );
    expect(r.replayedAt).toBe('2026-01-01T00:00:00Z');
  });
});

describe('multi-region-arbitration.pruneQueue', () => {
  it('keeps queue under cap', () => {
    const over = Array.from({ length: MAX_REPLAY_QUEUE_DEPTH + 5 }, (_, i) => ({
      id: `r${i}`,
      conflictId: 'c1',
      regionId: 'eu-central-1',
      payload: {},
      enqueuedAt: '',
      attempts: 0,
      nextAttemptAt: '',
    }));
    const pruned = pruneQueue(over);
    expect(pruned.length).toBe(MAX_REPLAY_QUEUE_DEPTH);
  });
  it('returns queue unchanged when under cap', () => {
    const out = pruneQueue([]);
    expect(out).toEqual([]);
  });
});

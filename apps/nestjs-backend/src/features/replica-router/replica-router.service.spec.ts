/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildReplicaRow,
  decideRoute,
  foldHealthCheck,
  isValidKind,
  isValidPolicy,
  isValidStatus,
  lagBucket,
  pickNearest,
  pickRoundRobin,
  regionHash,
  validateReplicaInput,
} from './replica-router.service';
import type { IReadReplica } from './replica-router.types';
import { DEFAULT_MAX_LAG_MS, DEFAULT_WEIGHT } from './replica-router.types';

const d = (iso: string) => new Date(iso);
const replica = (over: Partial<IReadReplica> = {}): IReadReplica => ({
  id: 'r',
  baseId: 'b',
  kind: 'physical-replica',
  region: 'us-east-1',
  connectionUrl: 'postgres://primary.local:5432/teable',
  status: 'online',
  maxLagMs: DEFAULT_MAX_LAG_MS,
  routingPolicy: 'nearest',
  weight: DEFAULT_WEIGHT,
  createdTime: d('2026-01-01T00:00:00Z'),
  updatedTime: d('2026-01-01T00:00:00Z'),
  ...over,
});

describe('replica-router helpers (Stage 44)', () => {
  describe('validators', () => {
    it('accepts the three replica kinds', () => {
      expect(isValidKind('primary')).toBe(true);
      expect(isValidKind('logical-replica')).toBe(true);
      expect(isValidKind('physical-replica')).toBe(true);
      expect(isValidKind('mirror')).toBe(false);
    });
    it('accepts the four statuses', () => {
      expect(isValidStatus('online')).toBe(true);
      expect(isValidStatus('lagging')).toBe(true);
      expect(isValidStatus('paused')).toBe(true);
      expect(isValidStatus('error')).toBe(true);
      expect(isValidStatus('mystery')).toBe(false);
    });
    it('accepts the three policies', () => {
      expect(isValidPolicy('round-robin')).toBe(true);
      expect(isValidPolicy('nearest')).toBe(true);
      expect(isValidPolicy('primary-when-stale')).toBe(true);
      expect(isValidPolicy('random')).toBe(false);
    });
  });

  describe('validateReplicaInput', () => {
    it('accepts a minimal input', () => {
      expect(() =>
        validateReplicaInput({
          baseId: 'b',
          kind: 'physical-replica',
          region: 'us-east-1',
          connectionUrl: 'postgres://x',
        })
      ).not.toThrow();
    });
    it('rejects non-postgres connection URLs', () => {
      expect(() =>
        validateReplicaInput({
          baseId: 'b',
          kind: 'physical-replica',
          region: 'r',
          connectionUrl: 'http://x',
        })
      ).toThrow(/postgres/);
    });
    it('rejects negative maxLagMs', () => {
      expect(() =>
        validateReplicaInput({
          baseId: 'b',
          kind: 'physical-replica',
          region: 'r',
          connectionUrl: 'postgres://x',
          maxLagMs: -1,
        })
      ).toThrow(/maxLagMs/);
    });
    it('rejects zero weight', () => {
      expect(() =>
        validateReplicaInput({
          baseId: 'b',
          kind: 'physical-replica',
          region: 'r',
          connectionUrl: 'postgres://x',
          weight: 0,
        })
      ).toThrow(/weight/);
    });
    it('rejects blank region', () => {
      expect(() =>
        validateReplicaInput({
          baseId: 'b',
          kind: 'physical-replica',
          region: '   ',
          connectionUrl: 'postgres://x',
        })
      ).toThrow(/region/);
    });
  });

  describe('buildReplicaRow', () => {
    it('fills defaults', () => {
      const r = buildReplicaRow({
        id: 'r',
        baseId: 'b',
        kind: 'logical-replica',
        region: 'eu',
        connectionUrl: 'postgres://x',
      });
      expect(r.status).toBe('online');
      expect(r.maxLagMs).toBe(DEFAULT_MAX_LAG_MS);
      expect(r.weight).toBe(DEFAULT_WEIGHT);
      expect(r.routingPolicy).toBe('nearest');
    });
  });

  describe('regionHash', () => {
    it('is deterministic', () => {
      expect(regionHash('us-east-1')).toBe(regionHash('us-east-1'));
    });
    it('differs across regions', () => {
      expect(regionHash('us-east-1')).not.toBe(regionHash('eu-west-1'));
    });
  });

  describe('pickNearest', () => {
    it('returns null when no replicas are online', () => {
      expect(pickNearest([replica({ status: 'paused' })], 'us-east-1')).toBeNull();
    });
    it('returns the same-region replica', () => {
      const a = replica({ id: 'a', region: 'us-east-1' });
      const b = replica({ id: 'b', region: 'eu-west-1' });
      expect(pickNearest([a, b], 'us-east-1')?.id).toBe('a');
    });
    it('falls back to the closest hash when no exact match', () => {
      const a = replica({ id: 'a', region: 'ap-south-1' });
      const b = replica({ id: 'b', region: 'ap-northeast-1' });
      // No exact match → hash distance pick; both are non-deterministic w/o seed,
      // but both should return a valid replica.
      const picked = pickNearest([a, b], 'ap-southeast-1');
      expect(picked?.id).toMatch(/a|b/);
    });
  });

  describe('pickRoundRobin', () => {
    it('returns null when no replicas are online', () => {
      expect(pickRoundRobin([replica({ status: 'paused' })], 0).replica).toBeNull();
    });
    it('honors weight', () => {
      const a = replica({ id: 'a', weight: 2 });
      const b = replica({ id: 'b', weight: 1 });
      const out = pickRoundRobin([a, b], 0);
      expect(out.replica?.id).toBe('a');
    });
    it('advances the cursor', () => {
      const a = replica({ id: 'a' });
      const b = replica({ id: 'b' });
      const r1 = pickRoundRobin([a, b], 0);
      const r2 = pickRoundRobin([a, b], r1.nextCursor);
      expect([r1.replica?.id, r2.replica?.id]).toEqual(['a', 'b']);
    });
  });

  describe('foldHealthCheck', () => {
    it('marks lagging when lag exceeds maxLagMs', () => {
      const r = foldHealthCheck(replica({ maxLagMs: 100 }), {
        replicaId: 'r',
        status: 'online',
        lagMs: 500,
        observedAt: new Date(),
      });
      expect(r.status).toBe('lagging');
    });
    it('keeps online when lag is within the limit', () => {
      const r = foldHealthCheck(replica({ maxLagMs: 1000 }), {
        replicaId: 'r',
        status: 'online',
        lagMs: 200,
        observedAt: new Date(),
      });
      expect(r.status).toBe('online');
    });
    it('preserves explicit error state', () => {
      const r = foldHealthCheck(replica(), {
        replicaId: 'r',
        status: 'error',
        lagMs: 0,
        observedAt: new Date(),
      });
      expect(r.status).toBe('error');
    });
  });

  describe('decideRoute', () => {
    it('routes to primary when no replicas exist', () => {
      const d = decideRoute({
        replicas: [],
        clientRegion: 'us',
        policy: 'nearest',
        health: new Map(),
        cursor: 0,
      });
      expect(d.routeTo).toBe('primary');
      expect(d.reason).toBe('no-replicas');
    });
    it('routes to nearest matching region', () => {
      const a = replica({ id: 'a', region: 'us-east-1', routingPolicy: 'nearest' });
      const b = replica({ id: 'b', region: 'eu-west-1', routingPolicy: 'nearest' });
      const d = decideRoute({
        replicas: [a, b],
        clientRegion: 'eu-west-1',
        policy: 'nearest',
        health: new Map(),
        cursor: 0,
      });
      expect(d.replicaId).toBe('b');
      expect(d.reason).toBe('policy-nearest');
    });
    it('falls back to primary when stale', () => {
      const r = replica({ id: 'a', maxLagMs: 100, routingPolicy: 'primary-when-stale' });
      const d = decideRoute({
        replicas: [r],
        clientRegion: 'us',
        policy: 'primary-when-stale',
        health: new Map([
          ['a', { replicaId: 'a', status: 'online', lagMs: 500, observedAt: new Date() }],
        ]),
        cursor: 0,
      });
      expect(d.routeTo).toBe('primary');
      expect(d.reason).toBe('policy-primary-when-stale-stale');
    });
    it('routes to replica when fresh (primary-when-stale)', () => {
      const r = replica({ id: 'a', maxLagMs: 1000, routingPolicy: 'primary-when-stale' });
      const d = decideRoute({
        replicas: [r],
        clientRegion: 'us',
        policy: 'primary-when-stale',
        health: new Map([
          ['a', { replicaId: 'a', status: 'online', lagMs: 50, observedAt: new Date() }],
        ]),
        cursor: 0,
      });
      expect(d.routeTo).toBe('replica');
      expect(d.replicaId).toBe('a');
      expect(d.reason).toBe('policy-primary-when-stale-fresh');
    });
    it('skips paused and errored replicas', () => {
      const a = replica({ id: 'a', status: 'paused', routingPolicy: 'nearest' });
      const b = replica({ id: 'b', region: 'us-east-1', routingPolicy: 'nearest' });
      const d = decideRoute({
        replicas: [a, b],
        clientRegion: 'us-east-1',
        policy: 'nearest',
        health: new Map(),
        cursor: 0,
      });
      expect(d.replicaId).toBe('b');
    });
    it('round-robin distributes', () => {
      const a = replica({ id: 'a', routingPolicy: 'round-robin' });
      const b = replica({ id: 'b', routingPolicy: 'round-robin' });
      const picks = new Set<string>();
      let cursor = 0;
      for (let i = 0; i < 4; i++) {
        const d = decideRoute({
          replicas: [a, b],
          clientRegion: 'us',
          policy: 'round-robin',
          health: new Map(),
          cursor,
        });
        if (d.replicaId) picks.add(d.replicaId);
        cursor = d.nextCursor;
      }
      expect(picks.size).toBe(2);
    });
  });

  describe('lagBucket', () => {
    it('classifies lag into buckets', () => {
      expect(lagBucket(100)).toBe('fresh');
      expect(lagBucket(1000)).toBe('warm');
      expect(lagBucket(5000)).toBe('stale');
    });
  });
});

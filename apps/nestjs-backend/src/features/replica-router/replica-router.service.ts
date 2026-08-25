/**
 * Read-only replica + read routing — Stage 44.
 *
 * Pure helpers: replica selection (round-robin / nearest /
 * primary-when-stale), weight tracking, lag-bucketing, and a
 * round-robin cursor that rotates per request.
 */

import type {
  IHealthCheck,
  IReadReplica,
  IRouteDecision,
  IRegisterReplicaInput,
  ReplicaStatus,
  RoutingPolicy,
} from './replica-router.types';
import { DEFAULT_MAX_LAG_MS, DEFAULT_WEIGHT } from './replica-router.types';

export function isValidKind(k: string): boolean {
  return k === 'primary' || k === 'logical-replica' || k === 'physical-replica';
}

export function isValidStatus(s: string): s is ReplicaStatus {
  return s === 'online' || s === 'lagging' || s === 'paused' || s === 'error';
}

export function isValidPolicy(p: string): p is RoutingPolicy {
  return p === 'round-robin' || p === 'nearest' || p === 'primary-when-stale';
}

export function validateReplicaInput(input: IRegisterReplicaInput): void {
  if (!isValidKind(input.kind)) throw new Error(`invalid kind: ${input.kind}`);
  if (!input.region || input.region.trim().length === 0) throw new Error('region required');
  if (
    !input.connectionUrl.startsWith('postgres://') &&
    !input.connectionUrl.startsWith('mysql://')
  ) {
    throw new Error('connectionUrl must be a postgres:// or mysql:// URL');
  }
  if (input.maxLagMs !== undefined && input.maxLagMs < 0) {
    throw new Error('maxLagMs must be ≥ 0');
  }
  if (input.weight !== undefined && input.weight <= 0) {
    throw new Error('weight must be > 0');
  }
}

export function buildReplicaRow(input: IRegisterReplicaInput & { id: string }): IReadReplica {
  validateReplicaInput(input);
  return {
    id: input.id,
    baseId: input.baseId,
    kind: input.kind,
    region: input.region,
    connectionUrl: input.connectionUrl,
    status: 'online',
    maxLagMs: input.maxLagMs ?? DEFAULT_MAX_LAG_MS,
    routingPolicy: input.routingPolicy ?? 'nearest',
    weight: input.weight ?? DEFAULT_WEIGHT,
    createdTime: new Date(),
    updatedTime: new Date(),
  };
}

/**
 * Hash a region string to a non-negative integer. Used to deterministically
 * pick a "nearest" replica when a client doesn't pass an explicit client region.
 */
export function regionHash(region: string): number {
  let h = 5381;
  for (let i = 0; i < region.length; i++) {
    h = ((h << 5) + h + region.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Pick the "nearest" replica using a simple region match; if no exact match,
 * fall back to the lowest hash-distance to clientRegion.
 */
export function pickNearest(
  replicas: ReadonlyArray<IReadReplica>,
  clientRegion: string
): IReadReplica | null {
  const online = replicas.filter((r) => r.status === 'online');
  if (online.length === 0) return null;
  const exact = online.find((r) => r.region === clientRegion);
  if (exact) return exact;
  const targetHash = regionHash(clientRegion);
  let best: IReadReplica | null = null;
  let bestDist = Infinity;
  for (const r of online) {
    const d = Math.abs(regionHash(r.region) - targetHash);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

/**
 * Pick the next replica using weighted round-robin. The cursor advances
 * by the replica's weight slot count. If no replicas are online, returns null.
 */
export function pickRoundRobin(
  replicas: ReadonlyArray<IReadReplica>,
  cursor: number
): { replica: IReadReplica | null; nextCursor: number } {
  const online = replicas.filter((r) => r.status === 'online');
  if (online.length === 0) return { replica: null, nextCursor: cursor };
  const slots: IReadReplica[] = [];
  for (const r of online) {
    for (let i = 0; i < r.weight; i++) slots.push(r);
  }
  if (slots.length === 0) return { replica: null, nextCursor: cursor };
  const idx = cursor % slots.length;
  return { replica: slots[idx] ?? null, nextCursor: cursor + 1 };
}

/** Update a replica's status based on the most recent health check. */
export function foldHealthCheck(replica: IReadReplica, health: IHealthCheck): IReadReplica {
  if (replica.id !== health.replicaId) return replica;
  const newStatus: ReplicaStatus =
    health.status === 'online' && health.lagMs > replica.maxLagMs ? 'lagging' : health.status;
  return { ...replica, status: newStatus, updatedTime: new Date() };
}

/**
 * Core routing decision. Returns primary when no usable replica is available,
 * or when the policy says so. The `lagMs` we record is the most recent observed
 * lag for the chosen replica (-1 when we routed to primary).
 */
export function decideRoute(input: {
  replicas: ReadonlyArray<IReadReplica>;
  clientRegion: string;
  policy: RoutingPolicy;
  health: ReadonlyMap<string, IHealthCheck>;
  cursor: number;
}): IRouteDecision & { nextCursor: number } {
  const usable = input.replicas.filter((r) => r.status === 'online' || r.status === 'lagging');
  if (usable.length === 0) {
    return {
      routeTo: 'primary',
      replicaId: null,
      policy: input.policy,
      lagMs: -1,
      reason: 'no-replicas',
      nextCursor: input.cursor,
    };
  }
  const fresh = usable.filter((r) => {
    const h = input.health.get(r.id);
    return !h || h.lagMs <= r.maxLagMs;
  });
  if (fresh.length === 0) {
    return {
      routeTo: 'primary',
      replicaId: null,
      policy: input.policy,
      lagMs: -1,
      reason:
        input.policy === 'primary-when-stale'
          ? 'policy-primary-when-stale-stale'
          : 'replica-offline',
      nextCursor: input.cursor,
    };
  }
  if (input.policy === 'primary-when-stale') {
    return {
      routeTo: 'replica',
      replicaId: fresh[0]!.id,
      policy: input.policy,
      lagMs: input.health.get(fresh[0]!.id)?.lagMs ?? 0,
      reason: 'policy-primary-when-stale-fresh',
      nextCursor: input.cursor,
    };
  }
  if (input.policy === 'nearest') {
    const r = pickNearest(fresh, input.clientRegion);
    if (!r) {
      return {
        routeTo: 'primary',
        replicaId: null,
        policy: input.policy,
        lagMs: -1,
        reason: 'replica-offline',
        nextCursor: input.cursor,
      };
    }
    return {
      routeTo: 'replica',
      replicaId: r.id,
      policy: input.policy,
      lagMs: input.health.get(r.id)?.lagMs ?? 0,
      reason: 'policy-nearest',
      nextCursor: input.cursor,
    };
  }
  // round-robin
  const { replica, nextCursor } = pickRoundRobin(fresh, input.cursor);
  if (!replica) {
    return {
      routeTo: 'primary',
      replicaId: null,
      policy: input.policy,
      lagMs: -1,
      reason: 'replica-offline',
      nextCursor: input.cursor,
    };
  }
  return {
    routeTo: 'replica',
    replicaId: replica.id,
    policy: input.policy,
    lagMs: input.health.get(replica.id)?.lagMs ?? 0,
    reason: 'policy-round-robin',
    nextCursor,
  };
}

/** Lag bucket used for alerting / dashboards. */
export function lagBucket(lagMs: number): 'fresh' | 'warm' | 'stale' {
  if (lagMs < 500) return 'fresh';
  if (lagMs < 2000) return 'warm';
  return 'stale';
}

/* eslint-disable @typescript-eslint/naming-convention */
export const POLICY_DESCRIPTIONS: Readonly<Record<RoutingPolicy, string>> = {
  'round-robin': 'distribute reads evenly across online replicas',
  nearest: 'prefer the replica closest to the client region',
  'primary-when-stale': 'use replicas only when lag is below maxLagMs',
};

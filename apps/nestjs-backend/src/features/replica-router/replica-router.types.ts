/**
 * Read-only replica + read routing — Stage 44 types.
 *
 * A `ReadReplica` row describes one physical / logical follower
 * (region + connection URL + routing policy). The `ReadRouteLog`
 * captures every routing decision so we can later audit where reads
 * went and how stale they were at decision time.
 */

export type ReplicaKind = 'primary' | 'logical-replica' | 'physical-replica';

export type ReplicaStatus = 'online' | 'lagging' | 'paused' | 'error';

export type RoutingPolicy = 'round-robin' | 'nearest' | 'primary-when-stale';

export interface IReadReplica {
  id: string;
  baseId: string;
  kind: ReplicaKind;
  region: string;
  connectionUrl: string;
  status: ReplicaStatus;
  /// Max tolerated replication lag (ms) before reads are routed back to primary.
  maxLagMs: number;
  routingPolicy: RoutingPolicy;
  /// Tiebreaker for round-robin; higher weight = more reads.
  weight: number;
  createdTime: Date;
  updatedTime: Date;
}

export interface IReadRouteLog {
  id: string;
  baseId: string;
  routeTo: 'primary' | 'replica';
  replicaId: string | null;
  policy: RoutingPolicy;
  /// Measured replication lag at decision time (ms, -1 = primary / not measured).
  lagMs: number;
  clientRegion: string;
  createdTime: Date;
}

export interface IRegisterReplicaInput {
  baseId: string;
  kind: ReplicaKind;
  region: string;
  connectionUrl: string;
  maxLagMs?: number;
  routingPolicy?: RoutingPolicy;
  weight?: number;
}

export interface IRouteDecision {
  routeTo: 'primary' | 'replica';
  replicaId: string | null;
  policy: RoutingPolicy;
  lagMs: number;
  /// Reason captured for logs: why this route was chosen.
  reason:
    | 'no-replicas'
    | 'policy-primary-when-stale-stale'
    | 'policy-primary-when-stale-fresh'
    | 'policy-round-robin'
    | 'policy-nearest'
    | 'replica-offline'
    | 'replica-paused'
    | 'replica-error';
}

export interface IHealthCheck {
  replicaId: string;
  status: ReplicaStatus;
  /// Most recently observed replication lag (ms).
  lagMs: number;
  observedAt: Date;
}

export const DEFAULT_MAX_LAG_MS = 2000;
export const DEFAULT_WEIGHT = 1;

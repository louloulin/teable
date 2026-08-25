import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildReplicaRow,
  decideRoute,
  foldHealthCheck,
  isValidKind,
  isValidPolicy,
  isValidStatus,
  regionHash,
} from './replica-router.service';
import type {
  IHealthCheck,
  IReadReplica,
  IReadRouteLog,
  IRegisterReplicaInput,
  IRouteDecision,
  ReplicaKind,
  ReplicaStatus,
  RoutingPolicy,
} from './replica-router.types';

@Injectable()
export class ReplicaRouterAuthService {
  /** Per-process cursor for round-robin. Reset by every health-check refresh. */
  private cursor = 0;

  constructor(private readonly prisma: PrismaService) {}

  async register(input: IRegisterReplicaInput): Promise<IReadReplica> {
    if (!isValidKind(input.kind)) throw new BadRequestException(`invalid kind: ${input.kind}`);
    if (input.routingPolicy && !isValidPolicy(input.routingPolicy)) {
      throw new BadRequestException(`invalid policy: ${input.routingPolicy}`);
    }
    const dup = await this.prisma.readReplica.findFirst({
      where: { baseId: input.baseId, region: input.region, kind: input.kind },
    });
    if (dup) throw new BadRequestException(`replica already registered: ${input.region}`);
    const id = `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildReplicaRow({ id, ...input });
    const created = await this.prisma.readReplica.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        kind: row.kind,
        region: row.region,
        connectionUrl: row.connectionUrl,
        status: row.status,
        maxLagMs: row.maxLagMs,
        routingPolicy: row.routingPolicy,
        weight: row.weight,
      },
    });
    return toReplica(created);
  }

  async list(baseId: string): Promise<IReadReplica[]> {
    const rows = await this.prisma.readReplica.findMany({ where: { baseId } });
    return rows.map(toReplica);
  }

  async updateStatus(replicaId: string, status: ReplicaStatus): Promise<IReadReplica> {
    if (!isValidStatus(status)) throw new BadRequestException(`invalid status: ${status}`);
    const existing = await this.prisma.readReplica.findUnique({ where: { id: replicaId } });
    if (!existing) throw new NotFoundException(`replica not found: ${replicaId}`);
    const updated = await this.prisma.readReplica.update({
      where: { id: replicaId },
      data: { status, updatedTime: new Date() },
    });
    return toReplica(updated);
  }

  async deleteReplica(replicaId: string): Promise<void> {
    const existing = await this.prisma.readReplica.findUnique({ where: { id: replicaId } });
    if (!existing) throw new NotFoundException(`replica not found: ${replicaId}`);
    await this.prisma.readReplica.delete({ where: { id: replicaId } });
  }

  async recordHealthCheck(input: {
    replicaId: string;
    status: ReplicaStatus;
    lagMs: number;
  }): Promise<void> {
    const existing = await this.prisma.readReplica.findUnique({ where: { id: input.replicaId } });
    if (!existing) throw new NotFoundException(`replica not found: ${input.replicaId}`);
    const folded = foldHealthCheck(toReplica(existing), {
      replicaId: input.replicaId,
      status: input.status,
      lagMs: input.lagMs,
      observedAt: new Date(),
    });
    await this.prisma.readReplica.update({
      where: { id: input.replicaId },
      data: { status: folded.status, updatedTime: new Date() },
    });
  }

  async routeForBase(input: {
    baseId: string;
    clientRegion: string;
    policy: RoutingPolicy;
    health?: ReadonlyMap<string, IHealthCheck>;
  }): Promise<IRouteDecision & { replica: IReadReplica | null }> {
    if (!isValidPolicy(input.policy))
      throw new BadRequestException(`invalid policy: ${input.policy}`);
    const replicas = await this.list(input.baseId);
    const decision = decideRoute({
      replicas,
      clientRegion: input.clientRegion,
      policy: input.policy,
      health: input.health ?? new Map(),
      cursor: this.cursor,
    });
    this.cursor = decision.nextCursor;
    const replica =
      decision.routeTo === 'replica' && decision.replicaId
        ? replicas.find((r) => r.id === decision.replicaId) ?? null
        : null;
    await this.appendLog({
      baseId: input.baseId,
      routeTo: decision.routeTo,
      replicaId: decision.replicaId,
      policy: decision.policy,
      lagMs: decision.lagMs,
      clientRegion: input.clientRegion,
    });
    return { ...decision, replica };
  }

  async listLogs(input: { baseId: string; limit?: number }): Promise<IReadRouteLog[]> {
    const limit = input.limit ?? 100;
    const rows = await this.prisma.readRouteLog.findMany({
      where: { baseId: input.baseId },
      orderBy: { createdTime: 'desc' },
      take: limit,
    });
    return rows.map(toLog);
  }

  private async appendLog(input: {
    baseId: string;
    routeTo: 'primary' | 'replica';
    replicaId: string | null;
    policy: RoutingPolicy;
    lagMs: number;
    clientRegion: string;
  }): Promise<void> {
    const id = `rrl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await this.prisma.readRouteLog.create({
      data: {
        id,
        baseId: input.baseId,
        routeTo: input.routeTo,
        replicaId: input.replicaId,
        policy: input.policy,
        lagMs: input.lagMs,
        clientRegion: input.clientRegion,
      },
    });
  }

  decideRoute = decideRoute;
  foldHealthCheck = foldHealthCheck;
  regionHash = regionHash;
}

function toReplica(r: {
  id: string;
  baseId: string;
  kind: string;
  region: string;
  connectionUrl: string;
  status: string;
  maxLagMs: number;
  routingPolicy: string;
  weight: number;
  createdTime: Date;
  updatedTime: Date;
}): IReadReplica {
  return {
    id: r.id,
    baseId: r.baseId,
    kind: r.kind as ReplicaKind,
    region: r.region,
    connectionUrl: r.connectionUrl,
    status: r.status as ReplicaStatus,
    maxLagMs: r.maxLagMs,
    routingPolicy: r.routingPolicy as RoutingPolicy,
    weight: r.weight,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toLog(r: {
  id: string;
  baseId: string;
  routeTo: string;
  replicaId: string | null;
  policy: string;
  lagMs: number;
  clientRegion: string;
  createdTime: Date;
}): IReadRouteLog {
  return {
    id: r.id,
    baseId: r.baseId,
    routeTo: r.routeTo as 'primary' | 'replica',
    replicaId: r.replicaId,
    policy: r.policy as RoutingPolicy,
    lagMs: r.lagMs,
    clientRegion: r.clientRegion,
    createdTime: r.createdTime,
  };
}

/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Multi-region write arbitration — NestJS auth service (Stage 68).
 *
 * Owns write leases, conflict records, and the replay queue. The
 * `arbitrateAndPersist()` entry point runs the pure decision and writes
 * the resulting lease; conflicts get recorded with the loser payload
 * preserved for replay.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  arbitrateWrite,
  detectSplitBrain,
  enqueueReplay,
  markReplayed,
  pruneQueue,
  readyReplays,
  recordConflict,
  validateRequest,
} from './multi-region-arbitration.service';
import type {
  ArbitrationDecision,
  ConflictResolution,
  IConflictRecord,
  IMultiRegionArbitrationOptions,
  IRegionClock,
  IReplayQueueEntry,
  IWriteLease,
  IWriteRequest,
} from './multi-region-arbitration.types';

@Injectable()
export class MultiRegionArbitrationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a write request. */
  validate(req: IWriteRequest): string | null {
    return validateRequest(req);
  }

  /** Load the active lease for a resource, if any. */
  async loadLease(resourceKey: string): Promise<IWriteLease | null> {
    const row = await this.prisma.regionWriteLease.findUnique({
      where: { resourceKey },
    });
    return row ? toLease(row) : null;
  }

  /** List leases for a region (operational dashboard view). */
  async listLeasesForRegion(regionId: string): Promise<IWriteLease[]> {
    const rows = await this.prisma.regionWriteLease.findMany({
      where: { regionId },
    });
    return rows.map(toLease);
  }

  /** Arbitrate and persist the resulting lease. */
  async arbitrateAndPersist(input: {
    request: IWriteRequest;
    options?: IMultiRegionArbitrationOptions;
  }): Promise<ArbitrationDecision> {
    const existing = await this.loadLease(input.request.resourceKey);
    const decision = arbitrateWrite({
      request: input.request,
      existingLease: existing,
      ...(input.options ? { options: input.options } : {}),
    });
    if (decision.kind === 'admit') {
      await this.persistLease(decision.lease);
    }
    return decision;
  }

  /** Persist a lease (upsert). */
  async persistLease(lease: IWriteLease): Promise<IWriteLease> {
    await this.prisma.regionWriteLease.upsert({
      where: { resourceKey: lease.resourceKey },
      create: {
        resourceKey: lease.resourceKey,
        regionId: lease.regionId,
        holderId: lease.holderId,
        acquiredAt: new Date(lease.acquiredAt),
        expiresAt: new Date(lease.expiresAt),
        generation: lease.generation,
        state: lease.state,
      },
      update: {
        regionId: lease.regionId,
        holderId: lease.holderId,
        expiresAt: new Date(lease.expiresAt),
        generation: lease.generation,
        state: lease.state,
      },
    });
    return lease;
  }

  /** Revoke a lease (admin path). */
  async revokeLease(resourceKey: string): Promise<boolean> {
    const existing = await this.loadLease(resourceKey);
    if (!existing) return false;
    existing.state = 'revoked';
    await this.persistLease(existing);
    return true;
  }

  /** Record a conflict for the loser region. */
  async recordConflict(input: {
    resourceKey: string;
    winnerRegion: string;
    loserRegion: string;
    winnerVersion: number;
    loserVersion: number;
    resolution?: ConflictResolution;
  }): Promise<IConflictRecord> {
    const conflict = recordConflict(input);
    await this.prisma.regionConflict.create({
      data: {
        id: conflict.id,
        resourceKey: conflict.resourceKey,
        winnerRegion: conflict.winnerRegion,
        loserRegion: conflict.loserRegion,
        winnerVersion: conflict.winnerVersion,
        loserVersion: conflict.loserVersion,
        resolution: conflict.resolution,
        detectedAt: new Date(conflict.detectedAt),
        replayedAt: null,
      },
    });
    return conflict;
  }

  /** Enqueue a replay entry for a conflict. */
  async enqueueReplay(input: {
    conflictId: string;
    regionId: string;
    payload: Record<string, unknown>;
    attempt?: number;
  }): Promise<IReplayQueueEntry> {
    const queue = await this.loadReplayQueue();
    const { entry } = enqueueReplay({ ...input, queue });
    await this.prisma.regionReplayQueue.create({
      data: {
        id: entry.id,
        conflictId: entry.conflictId,
        regionId: entry.regionId,
        payload: entry.payload as unknown as object,
        enqueuedAt: new Date(entry.enqueuedAt),
        attempts: entry.attempts,
        nextAttemptAt: new Date(entry.nextAttemptAt),
      },
    });
    return entry;
  }

  /** Load the full replay queue from persistence. */
  async loadReplayQueue(): Promise<IReplayQueueEntry[]> {
    const rows = await this.prisma.regionReplayQueue.findMany({
      orderBy: { enqueuedAt: 'asc' },
    });
    return rows.map(toReplay);
  }

  /** Pull all replay entries ready to attempt now. */
  async readyReplays(nowIso: string): Promise<IReplayQueueEntry[]> {
    const queue = await this.loadReplayQueue();
    return readyReplays(queue, nowIso);
  }

  /** Mark a conflict replayed. */
  async markReplayed(conflictId: string, nowIso: string): Promise<boolean> {
    const conflict = await this.loadConflict(conflictId);
    if (!conflict) return false;
    const updated = markReplayed(conflict, nowIso);
    await this.prisma.regionConflict.update({
      where: { id: conflictId },
      data: { replayedAt: new Date(updated.replayedAt!) },
    });
    return true;
  }

  /** Load a single conflict by id. */
  async loadConflict(id: string): Promise<IConflictRecord | null> {
    const row = await this.prisma.regionConflict.findUnique({ where: { id } });
    return row ? toConflict(row) : null;
  }

  /** Detect split-brain from a snapshot of region clocks. */
  detectSplitBrain(input: { fleet: IRegionClock[]; options?: IMultiRegionArbitrationOptions }) {
    return detectSplitBrain(input);
  }

  /** Prune the queue when approaching the cap. */
  async pruneQueue(): Promise<number> {
    const queue = await this.loadReplayQueue();
    const pruned = pruneQueue(queue);
    const dropCount = queue.length - pruned.length;
    if (dropCount > 0) {
      const keepIds = new Set(pruned.map((p) => p.id));
      const dropIds = queue.map((q) => q.id).filter((id) => !keepIds.has(id));
      await this.prisma.regionReplayQueue.deleteMany({
        where: { id: { in: dropIds } },
      });
    }
    return dropCount;
  }

  /** List registered regions (admin ops view). */
  async listRegions(): Promise<
    Array<{
      id: string;
      code: string;
      displayName: string;
      status: string;
      dataCenterLocation: string | null;
    }>
  > {
    const rows = await this.prisma.region.findMany({ orderBy: { code: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      displayName: r.displayName,
      status: r.status,
      dataCenterLocation: r.dataCenterLocation ?? null,
    }));
  }

  /** Snapshot health for a single region — lease counts + conflict totals. */
  async regionHealth(regionId: string): Promise<{
    regionId: string;
    activeLeases: number;
    totalLeases: number;
    conflictsAsWinner: number;
    conflictsAsLoser: number;
    queueDepth: number;
  }> {
    const [active, total, win, lose, queueDepth] = await Promise.all([
      this.prisma.regionWriteLease.count({
        where: { regionId, state: 'active', expiresAt: { gt: new Date() } },
      }),
      this.prisma.regionWriteLease.count({ where: { regionId } }),
      this.prisma.regionConflict.count({ where: { winnerRegion: regionId } }),
      this.prisma.regionConflict.count({ where: { loserRegion: regionId } }),
      this.prisma.regionReplayQueue.count({ where: { regionId } }),
    ]);
    return {
      regionId,
      activeLeases: active,
      totalLeases: total,
      conflictsAsWinner: win,
      conflictsAsLoser: lose,
      queueDepth,
    };
  }

  /** Aggregate arbitration status across the fleet. */
  async arbitrationStatus(): Promise<{
    regionCount: number;
    activeLeases: number;
    pendingConflicts: number;
    replayQueueDepth: number;
    sampledAt: string;
  }> {
    const [regionCount, activeLeases, pendingConflicts, replayQueueDepth] = await Promise.all([
      this.prisma.region.count(),
      this.prisma.regionWriteLease.count({
        where: { state: 'active', expiresAt: { gt: new Date() } },
      }),
      this.prisma.regionConflict.count({ where: { replayedAt: null } }),
      this.prisma.regionReplayQueue.count(),
    ]);
    return {
      regionCount,
      activeLeases,
      pendingConflicts,
      replayQueueDepth,
      sampledAt: new Date().toISOString(),
    };
  }
}

function toLease(row: Record<string, unknown>): IWriteLease {
  return {
    resourceKey: String(row['resourceKey']),
    regionId: String(row['regionId']),
    holderId: String(row['holderId'] ?? ''),
    acquiredAt: new Date(String(row['acquiredAt'] ?? Date.now())).toISOString(),
    expiresAt: new Date(String(row['expiresAt'] ?? Date.now())).toISOString(),
    generation: typeof row['generation'] === 'number' ? (row['generation'] as number) : 1,
    state: String(row['state'] ?? 'active') as IWriteLease['state'],
  };
}

function toConflict(row: Record<string, unknown>): IConflictRecord {
  return {
    id: String(row['id']),
    resourceKey: String(row['resourceKey']),
    winnerRegion: String(row['winnerRegion']),
    loserRegion: String(row['loserRegion']),
    winnerVersion: typeof row['winnerVersion'] === 'number' ? (row['winnerVersion'] as number) : 0,
    loserVersion: typeof row['loserVersion'] === 'number' ? (row['loserVersion'] as number) : 0,
    resolution: String(row['resolution'] ?? 'last-writer-wins') as ConflictResolution,
    detectedAt: new Date(String(row['detectedAt'] ?? Date.now())).toISOString(),
    replayedAt: row['replayedAt'] ? new Date(String(row['replayedAt'])).toISOString() : null,
  };
}

function toReplay(row: Record<string, unknown>): IReplayQueueEntry {
  return {
    id: String(row['id']),
    conflictId: String(row['conflictId']),
    regionId: String(row['regionId']),
    payload:
      typeof row['payload'] === 'object' && row['payload'] !== null
        ? (row['payload'] as Record<string, unknown>)
        : {},
    enqueuedAt: new Date(String(row['enqueuedAt'] ?? Date.now())).toISOString(),
    attempts: typeof row['attempts'] === 'number' ? (row['attempts'] as number) : 0,
    nextAttemptAt: new Date(String(row['nextAttemptAt'] ?? Date.now())).toISOString(),
  };
}

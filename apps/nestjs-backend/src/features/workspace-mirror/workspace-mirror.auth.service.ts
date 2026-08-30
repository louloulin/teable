/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Workspace Mirror — auth layer (Stage 61).
 *
 * Wires the pure mirror helpers to Prisma. The mirror captures write
 * records into `MirrorLog` and tracks per-standby acknowledgement in
 * `MirrorLag`.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, type Prisma } from '@teable/db-main-prisma';

import {
  batchRecords,
  buildBatchResult,
  computeLag,
  nextRecordId,
  nextSeq,
  pickNextStandby,
  summarizeLags,
  validateMirrorConfig,
} from './workspace-mirror.service';
import type {
  IMirrorBatchResult,
  IMirrorConfig,
  IMirrorLag,
  IMirrorLogRecord,
  IMirrorQueryResult,
} from './workspace-mirror.types';

@Injectable()
export class WorkspaceMirrorAuthService {
  constructor(private readonly prisma: PrismaService) {}

  validate(cfg: IMirrorConfig): string[] {
    return validateMirrorConfig(cfg);
  }

  /** Capture a write record into the log. Returns the persisted record. */
  async capture(args: {
    baseId: string;
    region: string;
    kind: string;
    payload: unknown;
    currentSeq: number;
  }): Promise<IMirrorLogRecord> {
    const seq = nextSeq(args.currentSeq);
    const id = nextRecordId(seq, args.region);
    const row = await this.prisma.mirrorLog.create({
      data: {
        id,
        baseId: args.baseId,
        region: args.region,
        kind: args.kind,
        payload: args.payload as Prisma.InputJsonValue,
        seq,
        recordedAt: new Date(),
      },
    });
    return {
      id: row.id,
      baseId: row.baseId,
      region: row.region,
      kind: row.kind,
      payload: row.payload,
      seq: row.seq,
      recordedAt: row.recordedAt.toISOString(),
    };
  }

  /** Slice the log into batches and ship the next one to a standby. */
  async shipNextBatch(args: {
    cfg: IMirrorConfig;
    records: ReadonlyArray<IMirrorLogRecord>;
    cursor: number;
    acknowledged: boolean;
  }): Promise<{
    standby: { region: string; priority: number } | null;
    result: IMirrorBatchResult | null;
  }> {
    const standby = pickNextStandby(args.cfg.standbys, args.cursor);
    if (!standby) return { standby: null, result: null };
    const batches = batchRecords(args.records, args.cfg.batchSize);
    const next = batches[0];
    if (!next) return { standby, result: null };
    const result = buildBatchResult({
      batchId: nextRecordId(next[0]?.seq ?? 0, standby.region),
      region: standby.region,
      records: next,
      acknowledged: args.acknowledged,
    });
    if (args.acknowledged) {
      await this.prisma.mirrorLag.upsert({
        where: { baseId_region: { baseId: args.cfg.baseId, region: standby.region } },
        update: { lastAckSeq: result.toSeq, shippedAt: new Date() },
        create: {
          baseId: args.cfg.baseId,
          region: standby.region,
          lastAckSeq: result.toSeq,
          shippedAt: new Date(),
        },
      });
    }
    return { standby, result };
  }

  /** Compute the current lag snapshot across standbys. */
  async lagSnapshot(cfg: IMirrorConfig): Promise<IMirrorQueryResult> {
    const lastPrimary = await this.prisma.mirrorLog.findFirst({
      where: { baseId: cfg.baseId, region: cfg.primary.region },
      orderBy: { seq: 'desc' },
    });
    const primarySeq = lastPrimary?.seq ?? 0;
    const lagRows = await this.prisma.mirrorLag.findMany({
      where: { baseId: cfg.baseId },
    });
    const lags: IMirrorLag[] = cfg.standbys.map((s) => {
      const row = lagRows.find((l) => l.region === s.region);
      return computeLag({
        region: s.region,
        lastAckSeq: row?.lastAckSeq ?? 0,
        primarySeq,
        shippedAt: row?.shippedAt ? row.shippedAt.toISOString() : null,
        maxLagSeconds: cfg.maxLagSeconds,
      });
    });
    return summarizeLags(cfg, lags);
  }
}

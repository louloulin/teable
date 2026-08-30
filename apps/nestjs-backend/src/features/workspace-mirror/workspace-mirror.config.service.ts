/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Workspace Mirror — config + lag read model backing the switcher UI.
 *
 * Why this service exists: the mirror feature shipped as pure helpers plus a
 * Prisma-backed capture/ship service, but nothing owned the *operator-facing*
 * config (which base mirrors where, tolerated lag, paused or not). The
 * switcher UI needs exactly that, so this service holds it and derives the
 * lag/health view via the existing pure helpers.
 *
 * Storage: Prisma-backed with an in-memory fallback for older installations
 * that have not applied the workspace mirror migrations yet.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, type Prisma } from '@teable/db-main-prisma';

import { computeLag, summarizeLags, validateMirrorConfig } from './workspace-mirror.service';
import type {
  IMirrorConfig,
  IMirrorLag,
  IMirrorLogRecord,
  IMirrorQueryResult,
} from './workspace-mirror.types';

interface IStoredConfig {
  config: IMirrorConfig;
  createdBy: string;
  updatedAt: string;
}

/** Shape of the (optional) `MirrorLag` row we read. */
interface IMirrorLagRow {
  region: string;
  lastAckSeq: number | null;
  shippedAt: Date | null;
}

/** Shape of the (optional) `MirrorLog` row we read. */
interface IMirrorLogRow {
  id: string;
  baseId: string;
  region: string;
  kind: string;
  payload: unknown;
  seq: number;
  recordedAt: Date;
}

export class MirrorConfigValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`invalid mirror config: ${errors.join('; ')}`);
  }
}

export class MirrorConfigNotFoundError extends Error {
  constructor(baseId: string) {
    super(`no mirror config for base ${baseId}`);
  }
}

@Injectable()
export class WorkspaceMirrorConfigService {
  private readonly logger = new Logger(WorkspaceMirrorConfigService.name);

  /** baseId -> stored config. */
  private readonly store = new Map<string, IStoredConfig>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Configs the given user created. Mirror config is a space-admin concern, so
   * the route guard has already established the caller may see this base; the
   * owner filter here only scopes the *unfiltered list* endpoint, which has no
   * baseId to guard on.
   */
  async list(userId: string): Promise<IMirrorConfig[]> {
    const delegate = this.configDelegate();
    if (delegate) {
      const rows = await delegate.findMany({
        where: { createdBy: userId },
        orderBy: { updatedTime: 'desc' },
      });
      return rows.map((row: { config: unknown }) => row.config as IMirrorConfig);
    }
    return [...this.store.values()]
      .filter((entry) => entry.createdBy === userId)
      .map((entry) => entry.config);
  }

  async get(baseId: string): Promise<IMirrorConfig> {
    const delegate = this.configDelegate();
    if (delegate) {
      const row = await delegate.findUnique({ where: { baseId } });
      if (row) return row.config as IMirrorConfig;
    }
    const entry = this.store.get(baseId);
    if (!entry) {
      throw new MirrorConfigNotFoundError(baseId);
    }
    return entry.config;
  }

  /** Create or replace the config for a base. Validated by the pure helper. */
  async upsert(config: IMirrorConfig, userId: string): Promise<IMirrorConfig> {
    const errors = validateMirrorConfig(config);
    if (errors.length > 0) {
      throw new MirrorConfigValidationError(errors);
    }
    const delegate = this.configDelegate();
    if (delegate) {
      const existing = await delegate.findUnique({ where: { baseId: config.baseId } });
      await delegate.upsert({
        where: { baseId: config.baseId },
        update: { config: config as unknown as Prisma.InputJsonValue },
        create: {
          baseId: config.baseId,
          config: config as unknown as Prisma.InputJsonValue,
          createdBy: existing?.createdBy ?? userId,
        },
      });
      return config;
    }
    // Preserve the original creator so `list()` stays stable across edits.
    const createdBy = this.store.get(config.baseId)?.createdBy ?? userId;
    this.store.set(config.baseId, {
      config,
      createdBy,
      updatedAt: new Date().toISOString(),
    });
    return config;
  }

  /**
   * Pause / resume shipping. `enabled: false` keeps capture running but stops
   * shipping — same semantics as `IMirrorConfig.enabled`.
   */
  async setEnabled(baseId: string, enabled: boolean): Promise<IMirrorConfig> {
    const config = await this.get(baseId);
    const delegate = this.configDelegate();
    const existing = delegate ? await delegate.findUnique({ where: { baseId } }) : undefined;
    return this.upsert(
      { ...config, enabled },
      existing?.createdBy ?? this.store.get(baseId)?.createdBy ?? 'system'
    );
  }

  /**
   * Per-standby lag plus the promotion-readiness roll-up, computed by the
   * existing pure helpers over whatever ack state we can read.
   */
  async statusOf(baseId: string): Promise<IMirrorQueryResult> {
    const config = await this.get(baseId);
    const primarySeq = await this.readPrimarySeq(config);
    const rows = await this.readLagRows(baseId);
    const lags = config.standbys.map((standby) => {
      const row = rows.find((r) => r.region === standby.region);
      return computeLag({
        region: standby.region,
        lastAckSeq: row?.lastAckSeq ?? 0,
        primarySeq,
        shippedAt: row?.shippedAt ? row.shippedAt.toISOString() : null,
        maxLagSeconds: config.maxLagSeconds,
      });
    });
    return summarizeLags(config, lags);
  }

  /**
   * Single worst-case lag for the badge: the standby furthest behind. Falls
   * back to a `broken` zero-lag record when a config has no standbys, which
   * `validateMirrorConfig` already rejects on write but could exist if a
   * config were seeded some other way.
   */
  async worstLag(baseId: string): Promise<IMirrorLag> {
    const status = await this.statusOf(baseId);
    const worst = [...status.standbys].sort(
      (a, b) => b.seqLag - a.seqLag || b.secondsLag - a.secondsLag
    )[0];
    return (
      worst ?? {
        region: status.primary.region,
        lastAckSeq: 0,
        primarySeq: 0,
        seqLag: 0,
        secondsLag: Number.POSITIVE_INFINITY,
        status: 'broken',
      }
    );
  }

  /** Recent log records for a base, newest first. Empty when unprovisioned. */
  async logs(baseId: string, since?: string, take = 100): Promise<IMirrorLogRecord[]> {
    // Confirm the base is configured before exposing its log.
    await this.get(baseId);
    const delegate = this.logDelegate();
    if (!delegate) {
      return [];
    }
    const sinceDate = since ? new Date(since) : undefined;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      return [];
    }
    try {
      const rows: IMirrorLogRow[] = await delegate.findMany({
        where: {
          baseId,
          ...(sinceDate ? { recordedAt: { gte: sinceDate } } : {}),
        },
        orderBy: { seq: 'desc' },
        take,
      });
      return rows.map((row) => ({
        id: row.id,
        baseId: row.baseId,
        region: row.region,
        kind: row.kind,
        payload: row.payload,
        seq: row.seq,
        recordedAt: row.recordedAt.toISOString(),
      }));
    } catch (err) {
      this.logger.warn(`mirror log read failed for ${baseId}: ${(err as Error).message}`);
      return [];
    }
  }

  private async readPrimarySeq(config: IMirrorConfig): Promise<number> {
    const delegate = this.logDelegate();
    if (!delegate) {
      return 0;
    }
    try {
      const latest = await delegate.findFirst({
        where: { baseId: config.baseId, region: config.primary.region },
        orderBy: { seq: 'desc' },
      });
      return latest?.seq ?? 0;
    } catch (err) {
      this.logger.warn(`mirror primary seq read failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private async readLagRows(baseId: string): Promise<IMirrorLagRow[]> {
    const delegate = this.lagDelegate();
    if (!delegate) {
      return [];
    }
    try {
      return await delegate.findMany({ where: { baseId } });
    } catch (err) {
      this.logger.warn(`mirror lag read failed: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Feature-detect the Prisma delegates. `MirrorLog` / `MirrorLag` are not in
   * the schema yet, so property access must not be assumed to exist.
   */
  private logDelegate(): any | undefined {
    return (this.prisma as unknown as Record<string, any>).mirrorLog;
  }

  private lagDelegate(): any | undefined {
    return (this.prisma as unknown as Record<string, any>).mirrorLag;
  }

  private configDelegate(): any | undefined {
    return (this.prisma as unknown as Record<string, any>).workspaceMirrorConfig;
  }
}

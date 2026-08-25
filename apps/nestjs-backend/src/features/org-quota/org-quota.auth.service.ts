/**
 * Org-level quota orchestration — NestJS auth service (Stage 65).
 *
 * Wraps the pure helpers in a NestJS service that persists the
 * envelope, the fairness state, and the overage ledger through
 * Prisma. The `checkAndGrant()` entry point is the hot path used by
 * the request interceptor.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyGrant,
  applyOptions,
  buildOverage,
  computeRemaining,
  decideQuota,
  emptyFairnessState,
  normalizeEnvelope,
  validateEnvelope,
} from './org-quota.service';
import type {
  IFairnessState,
  IOrgQuotaCheckResult,
  IOrgQuotaEnvelope,
  IOrgQuotaOverage,
  IOrgQuotaUsage,
  OveragePolicy,
  QuotaKind,
} from './org-quota.types';

@Injectable()
export class OrgQuotaAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate an envelope. */
  validate(env: IOrgQuotaEnvelope): string[] {
    return validateEnvelope(env);
  }

  /** Load an envelope for an org; returns null when unset. */
  async loadEnvelope(orgId: string): Promise<IOrgQuotaEnvelope | null> {
    const row = await this.prisma.orgQuotaEnvelope.findUnique({ where: { orgId } });
    return row ? toDomain(row) : null;
  }

  /** Persist an envelope. */
  async persistEnvelope(env: IOrgQuotaEnvelope): Promise<void> {
    const norm = normalizeEnvelope(env);
    await this.prisma.orgQuotaEnvelope.upsert({
      where: { orgId: norm.orgId },
      create: {
        orgId: norm.orgId,
        caps: norm.caps as unknown as object,
        policy: norm.policy,
        softFraction: norm.softFraction,
        windowSeconds: norm.windowSeconds,
        notes: norm.notes ?? null,
      },
      update: {
        caps: norm.caps as unknown as object,
        policy: norm.policy,
        softFraction: norm.softFraction,
        windowSeconds: norm.windowSeconds,
        notes: norm.notes ?? null,
      },
    });
  }

  /** Load the fairness state for an org (creates empty if missing). */
  async loadFairness(orgId: string): Promise<IFairnessState> {
    const row = await this.prisma.orgQuotaFairness.findUnique({ where: { orgId } });
    if (!row) return emptyFairnessState(orgId);
    return {
      orgId: row.orgId,
      deficits: (row.deficits as Record<string, number>) ?? {},
      lastGrantByBase: (row.lastGrantByBase as Record<string, string>) ?? {},
      totalGrants: row.totalGrants,
    };
  }

  /** Persist the fairness state. */
  async persistFairness(state: IFairnessState): Promise<void> {
    await this.prisma.orgQuotaFairness.upsert({
      where: { orgId: state.orgId },
      create: {
        orgId: state.orgId,
        deficits: state.deficits,
        lastGrantByBase: state.lastGrantByBase,
        totalGrants: state.totalGrants,
      },
      update: {
        deficits: state.deficits,
        lastGrantByBase: state.lastGrantByBase,
        totalGrants: state.totalGrants,
      },
    });
  }

  /** Record an overage event. */
  async recordOverage(input: {
    envelope: IOrgQuotaEnvelope;
    baseId: string;
    kind: QuotaKind;
    requested: number;
    decision: IOrgQuotaCheckResult['decision'];
    now?: Date;
  }): Promise<IOrgQuotaOverage> {
    const event = buildOverage(input);
    await this.prisma.orgQuotaOverage.create({
      data: {
        orgId: event.orgId,
        baseId: event.baseId,
        kind: event.kind,
        attemptedAt: new Date(event.attemptedAt),
        requestedUnits: BigInt(event.requestedUnits),
        decision: event.decision,
        reason: event.reason,
      },
    });
    return event;
  }

  /** Recent overage events for an org (most recent first). */
  async recentOverages(orgId: string, limit = 50): Promise<IOrgQuotaOverage[]> {
    const rows = await this.prisma.orgQuotaOverage.findMany({
      where: { orgId },
      orderBy: { attemptedAt: 'desc' },
      take: Math.max(1, Math.min(limit, 500)),
    });
    return rows.map((r) => ({
      orgId: r.orgId,
      baseId: r.baseId,
      kind: r.kind as QuotaKind,
      attemptedAt: r.attemptedAt.toISOString(),
      requestedUnits:
        typeof r.requestedUnits === 'bigint' ? Number(r.requestedUnits) : r.requestedUnits,
      decision: r.decision as IOrgQuotaOverage['decision'],
      reason: r.reason,
    }));
  }

  /** Sum the usage for one kind across the supplied bases. */
  async aggregateUsage(input: {
    orgId: string;
    kind: QuotaKind;
    perBaseUsed: ReadonlyArray<{ baseId: string; used: number }>;
    windowStart: string;
    windowEnd: string;
  }): Promise<IOrgQuotaUsage> {
    const env = await this.loadEnvelope(input.orgId);
    const cap = env ? env.caps[input.kind] ?? null : null;
    const used = input.perBaseUsed.reduce((s, b) => s + Math.max(0, Math.floor(b.used)), 0);
    return {
      orgId: input.orgId,
      kind: input.kind,
      used,
      cap,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    };
  }

  /** Decide and apply the grant; persists the fairness ledger. */
  async checkAndGrant(input: {
    orgId: string;
    baseId: string;
    kind: QuotaKind;
    requested: number;
    perBaseUsed: ReadonlyArray<{ baseId: string; used: number }>;
    windowStart: string;
    windowEnd: string;
    candidateBaseIds?: ReadonlyArray<string>;
    now?: Date;
  }): Promise<{ result: IOrgQuotaCheckResult; state: IFairnessState; overage?: IOrgQuotaOverage }> {
    const env = await this.loadEnvelope(input.orgId);
    const envelope: IOrgQuotaEnvelope = env ?? {
      orgId: input.orgId,
      caps: {},
      policy: 'soft',
      softFraction: 0.85,
      windowSeconds: null,
    };
    const usage = await this.aggregateUsage({
      orgId: input.orgId,
      kind: input.kind,
      perBaseUsed: input.perBaseUsed,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    });
    const result = decideQuota({ envelope, usage, requested: input.requested });
    const fairness = await this.loadFairness(input.orgId);
    const scoped = applyOptions(fairness, {
      ...(input.candidateBaseIds ? { candidateBaseIds: input.candidateBaseIds } : {}),
    });
    const next = applyGrant({
      state: scoped,
      baseId: input.baseId,
      decision: result.decision,
      units: input.requested,
      ...(input.now ? { now: input.now } : {}),
    });
    await this.persistFairness(next);
    let overage: IOrgQuotaOverage | undefined;
    if (result.decision !== 'allow') {
      overage = await this.recordOverage({
        envelope,
        baseId: input.baseId,
        kind: input.kind,
        requested: input.requested,
        decision: result.decision,
        ...(input.now ? { now: input.now } : {}),
      });
    }
    return { result, state: next, ...(overage ? { overage } : {}) };
  }

  /** Compute the remaining headroom for one kind. */
  async remaining(orgId: string, kind: QuotaKind, used: number): Promise<number | bigint | null> {
    const env = await this.loadEnvelope(orgId);
    const cap = env ? env.caps[kind] ?? null : null;
    return computeRemaining(cap, used);
  }

  /** Update the policy without rewriting other fields. */
  async setPolicy(orgId: string, policy: OveragePolicy): Promise<void> {
    const env = await this.loadEnvelope(orgId);
    if (!env) return;
    await this.persistEnvelope({ ...env, policy });
  }
}

function toDomain(row: Record<string, unknown>): IOrgQuotaEnvelope {
  const capsRaw = (row['caps'] as Record<string, unknown> | null) ?? {};
  const caps: IOrgQuotaEnvelope['caps'] = {};
  for (const [k, v] of Object.entries(capsRaw)) {
    if (v === null) {
      caps[k as QuotaKind] = null;
    } else if (typeof v === 'number' || typeof v === 'bigint') {
      caps[k as QuotaKind] = v as number | bigint;
    }
  }
  return {
    orgId: String(row['orgId']),
    caps,
    policy: String(row['policy']) as OveragePolicy,
    softFraction: typeof row['softFraction'] === 'number' ? (row['softFraction'] as number) : 0.85,
    windowSeconds:
      row['windowSeconds'] === null
        ? null
        : typeof row['windowSeconds'] === 'number'
          ? (row['windowSeconds'] as number)
          : null,
    ...(row['notes'] ? { notes: String(row['notes']) } : {}),
  };
}

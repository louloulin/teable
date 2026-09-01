/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Audit retention — NestJS auth service (Stage 71).
 *
 * Owns policy persistence + retention sweeps. The service surfaces pure
 * helpers from audit-retention.service and only adds the persistence
 * mapping needed to coordinate hot/cold storage.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  decideTier,
  finishJob,
  normalizePolicy,
  planSweep,
  startJob,
  validatePolicy,
} from './audit-retention.service';
import type {
  IAuditEvent,
  IAuditRetentionPolicy,
  IRetentionJob,
  StorageTarget,
} from './audit-retention.types';

@Injectable()
export class AuditRetentionAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a policy — delegates to pure helper. */
  validate(p: IAuditRetentionPolicy): string | null {
    return validatePolicy(p);
  }

  /** Normalize a policy input. */
  normalize(input: {
    orgId: string;
    hotDays?: number;
    coldDays?: number;
    coldTarget?: StorageTarget | null;
    coldBucket?: string | null;
    coldPrefix?: string | null;
    redactPii?: boolean;
    updatedBy?: string;
  }): IAuditRetentionPolicy {
    return normalizePolicy(input);
  }

  /** Persist a policy (upsert). */
  async upsertPolicy(p: IAuditRetentionPolicy): Promise<IAuditRetentionPolicy> {
    const err = validatePolicy(p);
    if (err) throw new Error(`invalid policy: ${err}`);
    await this.prisma.auditRetentionPolicy.upsert({
      where: { orgId: p.orgId },
      create: {
        orgId: p.orgId,
        hotDays: p.hotDays,
        coldDays: p.coldDays,
        coldTarget: p.coldTarget,
        coldBucket: p.coldBucket,
        coldPrefix: p.coldPrefix,
        redactPii: p.redactPii,
        updatedAt: new Date(p.updatedAt),
        updatedBy: p.updatedBy,
      },
      update: {
        hotDays: p.hotDays,
        coldDays: p.coldDays,
        coldTarget: p.coldTarget,
        coldBucket: p.coldBucket,
        coldPrefix: p.coldPrefix,
        redactPii: p.redactPii,
        updatedAt: new Date(p.updatedAt),
        updatedBy: p.updatedBy,
      },
    });
    return p;
  }

  /** Load a policy for an org. */
  async loadPolicy(orgId: string): Promise<IAuditRetentionPolicy | null> {
    const row = await this.prisma.auditRetentionPolicy.findUnique({ where: { orgId } });
    return row ? toPolicy(row) : null;
  }

  /** Decide retention for a single event. */
  decide(policy: IAuditRetentionPolicy, event: IAuditEvent, now?: string) {
    return decideTier({ policy, event, ...(now ? { now } : {}) });
  }


  /** List all persisted policies (admin read-only). */
  async listAllPolicies(): Promise<IAuditRetentionPolicy[]> {
    const rows = await this.prisma.auditRetentionPolicy.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => toPolicy(r));
  }

  /** Count persisted policies (admin read-only). */
  async countPolicies(): Promise<number> {
    return this.prisma.auditRetentionPolicy.count();
  }

  /** Summarize persisted retention coverage (admin read-only). */
  async retentionStats(): Promise<{
    policies: number;
    coldStoragePolicies: number;
    piiRedactionPolicies: number;
  }> {
    const policies = await this.prisma.auditRetentionPolicy.findMany();
    return {
      policies: policies.length,
      coldStoragePolicies: policies.filter((p) => Boolean(p['coldTarget'])).length,
      piiRedactionPolicies: policies.filter((p) => Boolean(p['redactPii'])).length,
    };
  }

  /** Run a sweep — produce a job summary. */
  async runSweep(input: {
    orgId: string;
    policy: IAuditRetentionPolicy;
    events: IAuditEvent[];
    now?: string;
  }): Promise<IRetentionJob> {
    const job = startJob({
      id: `job-${input.orgId}-${Date.now()}`,
      orgId: input.orgId,
      ...(input.now ? { now: input.now } : {}),
    });
    const plan = planSweep({
      policy: input.policy,
      events: input.events,
      ...(input.now ? { now: input.now } : {}),
    });
    return finishJob({
      job,
      status: 'done',
      scanned: input.events.length,
      promoted: plan.promote.length,
      purged: plan.purge.length,
    });
  }

  /** Start a persisted job. */
  async persistJob(job: IRetentionJob): Promise<IRetentionJob> {
    await this.prisma.auditRetentionJob.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        orgId: job.orgId,
        status: job.status,
        startedAt: job.startedAt ? new Date(job.startedAt) : null,
        finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
        scanned: job.scanned,
        promotedToCold: job.promotedToCold,
        purged: job.purged,
        lastError: job.lastError,
      },
      update: {
        status: job.status,
        startedAt: job.startedAt ? new Date(job.startedAt) : null,
        finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
        scanned: job.scanned,
        promotedToCold: job.promotedToCold,
        purged: job.purged,
        lastError: job.lastError,
      },
    });
    return job;
  }
}

function toPolicy(row: Record<string, unknown>): IAuditRetentionPolicy {
  return {
    orgId: String(row['orgId']),
    hotDays: typeof row['hotDays'] === 'number' ? (row['hotDays'] as number) : 90,
    coldDays: typeof row['coldDays'] === 'number' ? (row['coldDays'] as number) : 365,
    coldTarget:
      row['coldTarget'] === null || row['coldTarget'] === undefined
        ? null
        : (String(row['coldTarget']) as StorageTarget),
    coldBucket: row['coldBucket'] === null ? null : String(row['coldBucket'] ?? ''),
    coldPrefix: row['coldPrefix'] === null ? null : String(row['coldPrefix'] ?? ''),
    redactPii: Boolean(row['redactPii']),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
    updatedBy: String(row['updatedBy'] ?? 'system'),
  };
}

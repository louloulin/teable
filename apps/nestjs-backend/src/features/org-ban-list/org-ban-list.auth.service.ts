/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org ban list — NestJS auth service (Stage 77).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendAudit,
  buildAudit,
  decideForCandidate,
  isEffective,
  normalizeEntry,
  revokeEntry,
  validateEntry,
} from './org-ban-list.service';
import type { BanEntryKind, BanListMode, IBanAudit, IBanEntry } from './org-ban-list.types';
import { MAX_AUDIT_PER_ENTRY } from './org-ban-list.types';

@Injectable()
export class OrgBanListAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate and create a new entry. */
  async createEntry(input: {
    id: string;
    orgId: string;
    kind: BanEntryKind;
    value: string;
    mode: BanListMode;
    reason: string;
    expiresAt: string | null;
    createdBy: string;
    auditId: string;
    now: string;
  }): Promise<{ entry: IBanEntry; audit: IBanAudit }> {
    const entry = normalizeEntry(input);
    const err = validateEntry(entry);
    if (err) throw new Error(`invalid entry: ${err}`);
    const audit = buildAudit({
      id: input.auditId,
      orgId: input.orgId,
      entryId: entry.id,
      action: 'create',
      actorId: input.createdBy,
      detail: `create ${input.kind}/${input.mode}`,
      now: input.now,
    });
    await this.prisma.orgBanEntry.create({
      data: {
        id: entry.id,
        orgId: entry.orgId,
        kind: entry.kind,
        value: entry.value,
        mode: entry.mode,
        reason: entry.reason,
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
        createdBy: entry.createdBy,
        createdAt: new Date(entry.createdAt),
        lastModifiedBy: entry.lastModifiedBy,
        revokedAt: null,
      },
    });
    await this.prisma.orgBanAudit.create({
      data: {
        id: audit.id,
        orgId: audit.orgId,
        entryId: audit.entryId,
        action: audit.action,
        actorId: audit.actorId,
        detail: audit.detail,
        occurredAt: new Date(audit.occurredAt),
      },
    });
    return { entry, audit };
  }

  /** Revoke an entry and audit. */
  async revokeEntry(input: {
    entryId: string;
    orgId: string;
    revokedBy: string;
    auditId: string;
    now: string;
  }): Promise<{ entry: IBanEntry; audit: IBanAudit } | null> {
    const row = await this.prisma.orgBanEntry.findUnique({ where: { id: input.entryId } });
    if (!row) return null;
    const base = this.rowToEntry(row);
    const next = revokeEntry({ entry: base, revokedBy: input.revokedBy, now: input.now });
    const audit = buildAudit({
      id: input.auditId,
      orgId: input.orgId,
      entryId: base.id,
      action: 'revoke',
      actorId: input.revokedBy,
      detail: 'revoke',
      now: input.now,
    });
    await this.prisma.orgBanEntry.update({
      where: { id: input.entryId },
      data: { revokedAt: new Date(next.revokedAt!), lastModifiedBy: next.lastModifiedBy },
    });
    await this.prisma.orgBanAudit.create({
      data: {
        id: audit.id,
        orgId: audit.orgId,
        entryId: audit.entryId,
        action: audit.action,
        actorId: audit.actorId,
        detail: audit.detail,
        occurredAt: new Date(audit.occurredAt),
      },
    });
    return { entry: next, audit };
  }

  /** Lookup audit log for an entry. */
  async loadAuditTrail(entryId: string): Promise<IBanAudit[]> {
    const rows = await this.prisma.orgBanAudit.findMany({
      where: { entryId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map((r) => ({
      id: String(r['id']),
      orgId: String(r['orgId']),
      entryId: String(r['entryId']),
      action: r['action'] as IBanAudit['action'],
      actorId: String(r['actorId']),
      detail: String(r['detail']),
      occurredAt: new Date(String(r['occurredAt'])).toISOString(),
    }));
  }

  /** Decide whether a candidate (ip/email/...) is allowed or blocked right now. */
  async decide(input: {
    candidate: { kind: BanEntryKind; value: string };
    orgId: string;
    now: string;
  }): Promise<'allow' | 'block' | 'neutral'> {
    const rows = await this.prisma.orgBanEntry.findMany({
      where: { orgId: input.orgId, kind: input.candidate.kind, value: input.candidate.value },
    });
    const entries = rows.map((r) => this.rowToEntry(r));
    return decideForCandidate({ candidate: input.candidate, entries, now: input.now });
  }

  /** Compute the remaining effective lifetime in ms; null if no expiry. */
  remainingLifetime(input: { entry: IBanEntry; now: string }): number | null {
    if (!isEffective(input)) return 0;
    if (!input.entry.expiresAt) return null;
    const ms = new Date(input.entry.expiresAt).getTime() - new Date(input.now).getTime();
    return Math.max(0, ms);
  }

  /** Append an audit entry to the per-entry log via DB query. */
  async appendAudit(input: {
    id: string;
    orgId: string;
    entryId: string;
    action: IBanAudit['action'];
    actorId: string;
    detail: string;
    now: string;
  }): Promise<IBanAudit> {
    const audit = buildAudit(input);
    await this.prisma.orgBanAudit.create({
      data: {
        id: audit.id,
        orgId: audit.orgId,
        entryId: audit.entryId,
        action: audit.action,
        actorId: audit.actorId,
        detail: audit.detail,
        occurredAt: new Date(audit.occurredAt),
      },
    });
    return audit;
  }

  /** Helper: trim a persisted log to the cap. Pure. */
  trimLog(input: { log: IBanAudit[]; cap?: number }): IBanAudit[] {
    return appendAudit({
      log: input.log.slice(0, Math.max(0, (input.cap ?? MAX_AUDIT_PER_ENTRY) - 1)),
      audit: input.log[input.log.length - 1] ?? {
        id: 'noop',
        orgId: '',
        entryId: '',
        action: 'edit',
        actorId: '',
        detail: '',
        occurredAt: '1970-01-01T00:00:00Z',
      },
      cap: input.cap ?? MAX_AUDIT_PER_ENTRY,
    });
  }

  private rowToEntry(r: Record<string, unknown>): IBanEntry {
    return {
      id: String(r['id']),
      orgId: String(r['orgId']),
      kind: r['kind'] as BanEntryKind,
      value: String(r['value']),
      mode: r['mode'] as BanListMode,
      reason: String(r['reason']),
      expiresAt: r['expiresAt'] ? new Date(String(r['expiresAt'])).toISOString() : null,
      createdBy: String(r['createdBy']),
      createdAt: new Date(String(r['createdAt'])).toISOString(),
      lastModifiedBy: r['lastModifiedBy'] ? String(r['lastModifiedBy']) : null,
      revokedAt: r['revokedAt'] ? new Date(String(r['revokedAt'])).toISOString() : null,
    };
  }
}

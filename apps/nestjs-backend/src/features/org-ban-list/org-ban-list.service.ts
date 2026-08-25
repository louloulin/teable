/**
 * Org ban / allow list — pure helpers (Stage 77).
 */

import type { BanEntryKind, BanListMode, IBanAudit, IBanEntry } from './org-ban-list.types';
import {
  BAN_ENTRY_VALUE_MAX,
  BAN_KINDS,
  BAN_MODES,
  MAX_BAN_ENTRIES_PER_ORG,
} from './org-ban-list.types';

/** Whether the kind is canonical. */
export function isBanEntryKind(s: string): s is BanEntryKind {
  return (BAN_KINDS as ReadonlyArray<string>).includes(s);
}

/** Whether the mode is canonical. */
export function isBanListMode(s: string): s is BanListMode {
  return (BAN_MODES as ReadonlyArray<string>).includes(s);
}

/** Max entries per org. */
export function maxBanEntriesPerOrg(): number {
  return MAX_BAN_ENTRIES_PER_ORG;
}

/** Validate a ban entry. */
export function validateEntry(e: IBanEntry): string | null {
  if (!e.id) return 'id required';
  if (!e.orgId) return 'orgId required';
  if (!isBanEntryKind(e.kind)) return `unknown kind: ${e.kind}`;
  if (!isBanListMode(e.mode)) return `unknown mode: ${e.mode}`;
  if (!e.value) return 'value required';
  if (e.value.length > BAN_ENTRY_VALUE_MAX) return `value > ${BAN_ENTRY_VALUE_MAX}`;
  if (!e.reason) return 'reason required';
  if (!e.createdBy) return 'createdBy required';
  if (!e.createdAt) return 'createdAt required';
  return null;
}

/** Normalize a new entry. */
export function normalizeEntry(input: {
  id: string;
  orgId: string;
  kind: BanEntryKind;
  value: string;
  mode: BanListMode;
  reason: string;
  expiresAt: string | null;
  createdBy: string;
  now: string;
}): IBanEntry {
  return {
    id: input.id,
    orgId: input.orgId,
    kind: input.kind,
    value: input.value.trim(),
    mode: input.mode,
    reason: input.reason,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
    createdAt: input.now,
    lastModifiedBy: null,
    revokedAt: null,
  };
}

/** Test if an entry is currently effective. */
export function isEffective(input: { entry: IBanEntry; now: string }): boolean {
  if (input.entry.revokedAt) return false;
  if (!input.entry.expiresAt) return true;
  return new Date(input.entry.expiresAt).getTime() > new Date(input.now).getTime();
}

/** Decide what to do with a candidate match (ip / email / device). */
export function decideForCandidate(input: {
  candidate: { kind: BanEntryKind; value: string };
  entries: IBanEntry[];
  now: string;
}): 'allow' | 'block' | 'neutral' {
  const matched = input.entries.filter(
    (e) => e.kind === input.candidate.kind && e.value === input.candidate.value
  );
  const effective = matched.filter((e) => isEffective({ entry: e, now: input.now }));
  if (effective.length === 0) return 'neutral';
  if (effective.some((e) => e.mode === 'block')) return 'block';
  // allow-list entries only short-circuit when there's no block
  if (effective.every((e) => e.mode === 'allow')) return 'allow';
  return 'block';
}

/** Append an audit entry to the per-entry log. */
export function appendAudit(input: {
  log: IBanAudit[];
  audit: IBanAudit;
  cap: number;
}): IBanAudit[] {
  const next = [...input.log, input.audit];
  while (next.length > input.cap) next.shift();
  return next;
}

/** Compose an audit record when mutating an entry. */
export function buildAudit(input: {
  id: string;
  orgId: string;
  entryId: string;
  action: IBanAudit['action'];
  actorId: string;
  detail: string;
  now: string;
}): IBanAudit {
  return {
    id: input.id,
    orgId: input.orgId,
    entryId: input.entryId,
    action: input.action,
    actorId: input.actorId,
    detail: input.detail,
    occurredAt: input.now,
  };
}

/** Mark an entry revoked. */
export function revokeEntry(input: {
  entry: IBanEntry;
  revokedBy: string;
  now: string;
}): IBanEntry {
  return {
    ...input.entry,
    revokedAt: input.now,
    lastModifiedBy: input.revokedBy,
  };
}

/** Compute remaining effective lifetime. */
export function remainingLifetimeMs(input: { entry: IBanEntry; now: string }): number | null {
  if (!input.entry.expiresAt) return null;
  const ms = new Date(input.entry.expiresAt).getTime() - new Date(input.now).getTime();
  return Math.max(0, ms);
}

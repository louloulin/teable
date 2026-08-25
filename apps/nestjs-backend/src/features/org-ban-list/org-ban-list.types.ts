/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level ban / allow list — Stage 77.
 *
 * Cooperates with Stage 25 (IP allowlist) by extending the model to
 * IP, email, device, actor, and country level. Each entry carries a
 * full audit trail so bans/unbans are reproducible.
 */

export type BanEntryKind = 'ip' | 'email' | 'device' | 'actor' | 'country';
export type BanListMode = 'allow' | 'block';

export interface IBanEntry {
  id: string;
  orgId: string;
  kind: BanEntryKind;
  /** Pattern value: CIDR for ip, FQDN for email, hex for device, etc. */
  value: string;
  mode: BanListMode;
  reason: string;
  /** ISO; null = never expires. */
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  /** Last actor that mutated this entry. */
  lastModifiedBy: string | null;
  /** Set when an entry is soft-deleted (kept for audit). */
  revokedAt: string | null;
}

export interface IBanAudit {
  id: string;
  orgId: string;
  entryId: string;
  /** "create" | "revoke" | "edit" */
  action: 'create' | 'revoke' | 'edit';
  actorId: string;
  detail: string;
  occurredAt: string;
}

export const MAX_BAN_ENTRIES_PER_ORG = 256;
export const MAX_AUDIT_PER_ENTRY = 32;
export const BAN_ENTRY_VALUE_MAX = 253;

export const BAN_KINDS: ReadonlyArray<BanEntryKind> = ['ip', 'email', 'device', 'actor', 'country'];
export const BAN_MODES: ReadonlyArray<BanListMode> = ['allow', 'block'];

export const BAN_KIND_LABELS: Record<BanEntryKind, string> = {
  ip: 'IP',
  email: '邮箱',
  device: '设备',
  actor: '账号',
  country: '国家',
};

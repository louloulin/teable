/**
 * Org ban / allow list — pure helpers spec (Stage 77).
 */

import {
  appendAudit,
  buildAudit,
  decideForCandidate,
  isBanEntryKind,
  isBanListMode,
  isEffective,
  maxBanEntriesPerOrg,
  normalizeEntry,
  remainingLifetimeMs,
  revokeEntry,
  validateEntry,
} from './org-ban-list.service';
import type { IBanAudit, IBanEntry } from './org-ban-list.types';
import {
  BAN_KIND_LABELS,
  MAX_AUDIT_PER_ENTRY,
  MAX_BAN_ENTRIES_PER_ORG,
} from './org-ban-list.types';

const baseEntry = (over: Partial<IBanEntry> = {}): IBanEntry => ({
  id: 'e1',
  orgId: 'o1',
  kind: 'ip',
  value: '1.2.3.4',
  mode: 'block',
  reason: 'spam',
  expiresAt: null,
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModifiedBy: null,
  revokedAt: null,
  ...over,
});

describe('org-ban-list.isBanEntryKind', () => {
  it('passes known kinds', () => {
    expect(isBanEntryKind('ip')).toBe(true);
    expect(isBanEntryKind('email')).toBe(true);
    expect(isBanEntryKind('actor')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isBanEntryKind('unknown')).toBe(false);
  });
});

describe('org-ban-list.isBanListMode', () => {
  it('passes known modes', () => {
    expect(isBanListMode('allow')).toBe(true);
    expect(isBanListMode('block')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isBanListMode('??')).toBe(false);
  });
});

describe('org-ban-list.maxBanEntriesPerOrg', () => {
  it('returns constant', () => {
    expect(maxBanEntriesPerOrg()).toBe(MAX_BAN_ENTRIES_PER_ORG);
  });
});

describe('org-ban-list.validateEntry', () => {
  it('passes a good entry', () => {
    expect(validateEntry(baseEntry())).toBeNull();
  });
  it('rejects missing id', () => {
    expect(validateEntry(baseEntry({ id: '' }))).toBe('id required');
  });
  it('rejects missing orgId', () => {
    expect(validateEntry(baseEntry({ orgId: '' }))).toBe('orgId required');
  });
  it('rejects unknown kind', () => {
    expect(validateEntry(baseEntry({ kind: 'foo' as never }))).toContain('kind');
  });
  it('rejects unknown mode', () => {
    expect(validateEntry(baseEntry({ mode: 'foo' as never }))).toContain('mode');
  });
  it('rejects missing value', () => {
    expect(validateEntry(baseEntry({ value: '' }))).toBe('value required');
  });
  it('rejects oversized value', () => {
    expect(validateEntry(baseEntry({ value: 'a'.repeat(300) }))).toContain('value >');
  });
  it('rejects missing reason', () => {
    expect(validateEntry(baseEntry({ reason: '' }))).toBe('reason required');
  });
});

describe('org-ban-list.normalizeEntry', () => {
  it('trims and stamps createdAt', () => {
    const e = normalizeEntry({
      id: 'e1',
      orgId: 'o1',
      kind: 'email',
      value: '  bad@example.com  ',
      mode: 'block',
      reason: 'spam',
      expiresAt: null,
      createdBy: 'admin',
      now: '2026-01-01T00:00:00Z',
    });
    expect(e.value).toBe('bad@example.com');
    expect(e.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(e.lastModifiedBy).toBeNull();
    expect(e.revokedAt).toBeNull();
  });
});

describe('org-ban-list.isEffective', () => {
  it('true when not revoked and not expired', () => {
    expect(isEffective({ entry: baseEntry(), now: '2026-01-02T00:00:00Z' })).toBe(true);
  });
  it('false when revoked', () => {
    expect(
      isEffective({
        entry: baseEntry({ revokedAt: '2026-01-01T12:00:00Z' }),
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe(false);
  });
  it('false when expired', () => {
    expect(
      isEffective({
        entry: baseEntry({ expiresAt: '2025-12-31T00:00:00Z' }),
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe(false);
  });
});

describe('org-ban-list.decideForCandidate', () => {
  it('block wins over allow', () => {
    const entries = [
      baseEntry({ id: 'a', mode: 'allow' }),
      baseEntry({ id: 'b', mode: 'block', value: '1.2.3.4' }),
    ];
    expect(
      decideForCandidate({
        candidate: { kind: 'ip', value: '1.2.3.4' },
        entries,
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe('block');
    expect(
      decideForCandidate({
        candidate: { kind: 'ip', value: '1.2.3.5' },
        entries,
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe('neutral');
  });
  it('returns allow when only allow matches', () => {
    expect(
      decideForCandidate({
        candidate: { kind: 'ip', value: '1.2.3.4' },
        entries: [baseEntry({ mode: 'allow' })],
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe('allow');
  });
  it('returns neutral when no match', () => {
    expect(
      decideForCandidate({
        candidate: { kind: 'ip', value: '9.9.9.9' },
        entries: [baseEntry()],
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe('neutral');
  });
  it('ignores expired entries', () => {
    expect(
      decideForCandidate({
        candidate: { kind: 'ip', value: '1.2.3.4' },
        entries: [baseEntry({ expiresAt: '2025-12-31T00:00:00Z' })],
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe('neutral');
  });
});

describe('org-ban-list.appendAudit', () => {
  it('appends within cap', () => {
    const audit: IBanAudit = {
      id: 'a1',
      orgId: 'o1',
      entryId: 'e1',
      action: 'create',
      actorId: 'admin',
      detail: 'created',
      occurredAt: '2026-01-01T00:00:00Z',
    };
    const next = appendAudit({ log: [], audit, cap: MAX_AUDIT_PER_ENTRY });
    expect(next.length).toBe(1);
  });
  it('trims when over cap', () => {
    const cap = 4;
    const log = Array.from({ length: cap }, (_, i) => ({
      id: `a${i}`,
      orgId: 'o1',
      entryId: 'e1',
      action: 'edit' as const,
      actorId: 'admin',
      detail: 'edit',
      occurredAt: '2026-01-01T00:00:00Z',
    }));
    const next = appendAudit({
      log,
      audit: { ...log[0]!, id: 'anew', occurredAt: '2026-01-02T00:00:00Z' },
      cap,
    });
    expect(next.length).toBe(cap);
    expect(next[next.length - 1]!.id).toBe('anew');
  });
});

describe('org-ban-list.buildAudit', () => {
  it('stamps occurredAt', () => {
    const a = buildAudit({
      id: 'a1',
      orgId: 'o1',
      entryId: 'e1',
      action: 'revoke',
      actorId: 'admin',
      detail: 'manual',
      now: '2026-01-01T00:00:00Z',
    });
    expect(a.occurredAt).toBe('2026-01-01T00:00:00Z');
    expect(a.action).toBe('revoke');
  });
});

describe('org-ban-list.revokeEntry', () => {
  it('sets revoked and lastModified', () => {
    const e = revokeEntry({
      entry: baseEntry(),
      revokedBy: 'admin2',
      now: '2026-02-01T00:00:00Z',
    });
    expect(e.revokedAt).toBe('2026-02-01T00:00:00Z');
    expect(e.lastModifiedBy).toBe('admin2');
  });
});

describe('org-ban-list.remainingLifetimeMs', () => {
  it('null when no expiry', () => {
    expect(remainingLifetimeMs({ entry: baseEntry(), now: '2026-01-02T00:00:00Z' })).toBeNull();
  });
  it('positive ms when in future', () => {
    expect(
      remainingLifetimeMs({
        entry: baseEntry({ expiresAt: '2026-01-02T00:00:00Z' }),
        now: '2026-01-01T00:00:00Z',
      })
    ).toBeGreaterThan(0);
  });
  it('zero when already expired', () => {
    expect(
      remainingLifetimeMs({
        entry: baseEntry({ expiresAt: '2025-12-31T00:00:00Z' }),
        now: '2026-01-02T00:00:00Z',
      })
    ).toBe(0);
  });
});

describe('org-ban-list.BAN_KIND_LABELS', () => {
  it('has label for every kind', () => {
    expect(Object.keys(BAN_KIND_LABELS).length).toBeGreaterThanOrEqual(5);
  });
});

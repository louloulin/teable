/* eslint-disable @typescript-eslint/naming-convention */
import {
  applyJoinPolicy,
  computeExpiresAt,
  deriveStatusOnTick,
  diffSessions,
  filterByQuery,
  isSessionExpired,
  isValidColor,
  isValidScope,
  isValidStatus,
  liveSessions,
  validateCursor,
  validateJoinInput,
  validateQueryInput,
  validateTickInput,
  validateUpdateStatusInput,
} from './presence.service';
import { DEFAULT_DISPLAY_NAME_MAX_LENGTH, DEFAULT_HEARTBEAT_TTL_MS } from './presence.types';
import type { ICursorState, IPresenceSession } from './presence.types';

function mkSession(over: Partial<IPresenceSession> = {}): IPresenceSession {
  const now = new Date('2024-01-01T00:00:00Z');
  return {
    id: 'ps_1',
    baseId: 'b1',
    scope: 'base',
    scopeId: 'b1',
    userId: 'u1',
    color: '#3b82f6',
    displayName: 'Alice',
    status: 'active',
    lastHeartbeatAt: now,
    expiresAt: new Date(now.getTime() + DEFAULT_HEARTBEAT_TTL_MS),
    connectedAt: now,
    ...over,
  };
}

describe('presence.validators', () => {
  describe('isValidScope', () => {
    it('accepts base/table/view/record', () => {
      expect(isValidScope('base')).toBe(true);
      expect(isValidScope('table')).toBe(true);
      expect(isValidScope('view')).toBe(true);
      expect(isValidScope('record')).toBe(true);
    });
    it('rejects unknown', () => {
      expect(isValidScope('wat')).toBe(false);
    });
  });

  describe('isValidStatus', () => {
    it('accepts active/idle/away/offline', () => {
      for (const s of ['active', 'idle', 'away', 'offline']) {
        expect(isValidStatus(s)).toBe(true);
      }
    });
    it('rejects unknown', () => {
      expect(isValidStatus('busy')).toBe(false);
    });
  });

  describe('isValidColor', () => {
    it('accepts 6-digit hex with # prefix', () => {
      expect(isValidColor('#3b82f6')).toBe(true);
      expect(isValidColor('#FFFFFF')).toBe(true);
    });
    it('rejects non-hex or wrong format', () => {
      expect(isValidColor('3b82f6')).toBe(false);
      expect(isValidColor('#xyzxyz')).toBe(false);
      expect(isValidColor('#12345')).toBe(false);
      expect(isValidColor('#1234567')).toBe(false);
    });
  });

  describe('validateJoinInput', () => {
    it('passes a minimal valid input', () => {
      expect(() =>
        validateJoinInput({
          baseId: 'b1',
          scope: 'base',
          scopeId: 'b1',
          userId: 'u1',
          color: '#3b82f6',
          displayName: 'Alice',
        })
      ).not.toThrow();
    });

    it('rejects invalid scope', () => {
      expect(() =>
        validateJoinInput({
          baseId: 'b1',
          scope: 'wat' as never,
          scopeId: 'b1',
          userId: 'u1',
          color: '#3b82f6',
          displayName: 'Alice',
        })
      ).toThrow(/scope/);
    });

    it('rejects missing scopeId', () => {
      expect(() =>
        validateJoinInput({
          baseId: 'b1',
          scope: 'table',
          scopeId: '',
          userId: 'u1',
          color: '#3b82f6',
          displayName: 'Alice',
        })
      ).toThrow(/scopeId/);
    });

    it('rejects missing displayName', () => {
      expect(() =>
        validateJoinInput({
          baseId: 'b1',
          scope: 'base',
          scopeId: 'b1',
          userId: 'u1',
          color: '#3b82f6',
          displayName: '',
        })
      ).toThrow(/displayName/);
    });

    it('rejects too-long displayName', () => {
      expect(() =>
        validateJoinInput({
          baseId: 'b1',
          scope: 'base',
          scopeId: 'b1',
          userId: 'u1',
          color: '#3b82f6',
          displayName: 'x'.repeat(DEFAULT_DISPLAY_NAME_MAX_LENGTH + 1),
        })
      ).toThrow(/too long/);
    });

    it('rejects invalid color', () => {
      expect(() =>
        validateJoinInput({
          baseId: 'b1',
          scope: 'base',
          scopeId: 'b1',
          userId: 'u1',
          color: 'red',
          displayName: 'Alice',
        })
      ).toThrow(/color/);
    });
  });

  describe('validateCursor', () => {
    const baseInput = (cursor: ICursorState) => ({
      sessionId: 'ps_1',
      cursor,
    });

    it('accepts a valid cursor', () => {
      expect(() =>
        validateCursor(baseInput({ tableId: 't1', rowIndex: 5, fieldId: 'f1' }))
      ).not.toThrow();
    });

    it('rejects negative rowIndex', () => {
      expect(() =>
        validateCursor(baseInput({ tableId: 't1', rowIndex: -1, fieldId: 'f1' }))
      ).toThrow(/rowIndex/);
    });

    it('rejects empty fieldId', () => {
      expect(() =>
        validateCursor(baseInput({ tableId: 't1', rowIndex: 0, fieldId: '' as never }))
      ).toThrow(/fieldId/);
    });

    it('rejects inverted selection range', () => {
      expect(() =>
        validateCursor(
          baseInput({
            tableId: 't1',
            rowIndex: 0,
            fieldId: 'f1',
            selectionRange: {
              start: { rowIndex: 5, fieldId: 'f2' },
              end: { rowIndex: 2, fieldId: 'f1' },
            },
          })
        )
      ).toThrow(/start.rowIndex/);
    });

    it('rejects empty fieldId in selectionRange', () => {
      expect(() =>
        validateCursor(
          baseInput({
            tableId: 't1',
            rowIndex: 0,
            fieldId: 'f1',
            selectionRange: {
              start: { rowIndex: 0, fieldId: '' },
              end: { rowIndex: 0, fieldId: 'f1' },
            },
          })
        )
      ).toThrow(/selectionRange/);
    });
  });

  describe('validateTickInput / validateUpdateStatusInput', () => {
    it('requires sessionId', () => {
      expect(() => validateTickInput({ sessionId: '' })).toThrow();
      expect(() => validateUpdateStatusInput({ sessionId: '', status: 'idle' })).toThrow();
    });
    it('rejects invalid status', () => {
      expect(() => validateTickInput({ sessionId: 'p', status: 'busy' as never })).toThrow();
      expect(() =>
        validateUpdateStatusInput({ sessionId: 'p', status: 'busy' as never })
      ).toThrow();
    });
    it('passes a valid tick', () => {
      expect(() => validateTickInput({ sessionId: 'p' })).not.toThrow();
      expect(() => validateUpdateStatusInput({ sessionId: 'p', status: 'idle' })).not.toThrow();
    });
  });

  describe('validateQueryInput', () => {
    it('requires baseId', () => {
      expect(() => validateQueryInput({ baseId: '' })).toThrow();
    });
    it('requires scopeId for non-base scope', () => {
      expect(() => validateQueryInput({ baseId: 'b1', scope: 'table' })).toThrow();
      expect(() => validateQueryInput({ baseId: 'b1', scope: 'view' })).toThrow();
      expect(() => validateQueryInput({ baseId: 'b1', scope: 'record' })).toThrow();
    });
    it('rejects invalid scope', () => {
      expect(() => validateQueryInput({ baseId: 'b1', scope: 'wat' as never })).toThrow();
    });
    it('accepts base-only query', () => {
      expect(() => validateQueryInput({ baseId: 'b1' })).not.toThrow();
    });
  });
});

describe('presence.state-derivation', () => {
  describe('deriveStatusOnTick', () => {
    it('returns offline when expired', () => {
      const s = mkSession({ expiresAt: new Date('2024-01-01T00:00:00Z') });
      expect(deriveStatusOnTick(s, new Date('2024-01-01T00:01:00Z'))).toBe('offline');
    });

    it('returns active when within TTL', () => {
      const now = new Date('2024-01-01T00:00:20Z');
      const s = mkSession({
        lastHeartbeatAt: new Date('2024-01-01T00:00:00Z'),
        expiresAt: new Date('2024-01-01T00:00:30Z'),
        status: 'active',
      });
      expect(deriveStatusOnTick(s, now)).toBe('active');
    });

    it('returns idle when heartbeat older than idleMs', () => {
      const now = new Date('2024-01-01T00:01:00Z');
      const s = mkSession({
        lastHeartbeatAt: new Date('2024-01-01T00:00:00Z'),
        expiresAt: new Date('2024-01-01T00:02:00Z'),
        status: 'active',
      });
      expect(deriveStatusOnTick(s, now, 30_000)).toBe('idle');
    });

    it('keeps away sticky (does not regress to active)', () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const s = mkSession({
        lastHeartbeatAt: new Date('2024-01-01T00:00:00Z'),
        expiresAt: new Date('2024-01-01T00:01:00Z'),
        status: 'away',
      });
      expect(deriveStatusOnTick(s, now)).toBe('away');
    });
  });

  describe('isSessionExpired', () => {
    it('true when now >= expiresAt', () => {
      const s = mkSession({ expiresAt: new Date('2024-01-01T00:00:00Z') });
      expect(isSessionExpired(s, new Date('2024-01-01T00:00:00Z'))).toBe(true);
      expect(isSessionExpired(s, new Date('2024-01-01T00:00:01Z'))).toBe(true);
    });
    it('false when before expiresAt', () => {
      const s = mkSession({ expiresAt: new Date('2024-01-01T00:01:00Z') });
      expect(isSessionExpired(s, new Date('2024-01-01T00:00:00Z'))).toBe(false);
    });
  });

  describe('computeExpiresAt', () => {
    it('returns now + ttlMs', () => {
      const now = new Date('2024-01-01T00:00:00.000Z');
      expect(computeExpiresAt(now, 5000).toISOString()).toBe('2024-01-01T00:00:05.000Z');
    });
  });
});

describe('presence.filters', () => {
  it('filterByQuery matches base only', () => {
    const sessions = [mkSession({ id: 'p1', baseId: 'b1' }), mkSession({ id: 'p2', baseId: 'b2' })];
    expect(filterByQuery(sessions, { baseId: 'b1' }).map((s) => s.id)).toEqual(['p1']);
  });

  it('filterByQuery matches base + scope', () => {
    const sessions = [
      mkSession({ id: 'p1', baseId: 'b1', scope: 'base' }),
      mkSession({ id: 'p2', baseId: 'b1', scope: 'table', scopeId: 't1' }),
    ];
    expect(filterByQuery(sessions, { baseId: 'b1', scope: 'table' }).map((s) => s.id)).toEqual([
      'p2',
    ]);
  });

  it('filterByQuery matches base + scope + scopeId', () => {
    const sessions = [
      mkSession({ id: 'p1', baseId: 'b1', scope: 'table', scopeId: 't1' }),
      mkSession({ id: 'p2', baseId: 'b1', scope: 'table', scopeId: 't2' }),
    ];
    expect(
      filterByQuery(sessions, { baseId: 'b1', scope: 'table', scopeId: 't1' }).map((s) => s.id)
    ).toEqual(['p1']);
  });

  it('liveSessions filters out expired', () => {
    const now = new Date('2024-01-01T00:01:00Z');
    const sessions = [
      mkSession({ id: 'p1', expiresAt: new Date('2024-01-01T00:00:30Z') }),
      mkSession({ id: 'p2', expiresAt: new Date('2024-01-01T00:02:00Z') }),
    ];
    expect(liveSessions(sessions, now).map((s) => s.id)).toEqual(['p2']);
  });
});

describe('presence.diff', () => {
  it('flags joined/left/changed correctly', () => {
    const a = mkSession({ id: 'p1', status: 'active' });
    const b = mkSession({ id: 'p2', status: 'active' });
    const c = mkSession({ id: 'p3', status: 'active' });
    const cChanged = mkSession({ id: 'p3', status: 'idle' });

    const diff = diffSessions([a, c], [b, cChanged]);
    expect(diff.joined.map((s) => s.id)).toEqual(['p2']);
    expect(diff.left.map((s) => s.id)).toEqual(['p1']);
    expect(diff.changed.map((s) => s.id)).toEqual(['p3']);
  });

  it('flags nothing when both lists identical', () => {
    const a = mkSession({ id: 'p1' });
    const b = mkSession({ id: 'p2' });
    const diff = diffSessions([a, b], [a, b]);
    expect(diff.joined).toHaveLength(0);
    expect(diff.left).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('flags cursor changes as changed', () => {
    const a = mkSession({ id: 'p1', cursor: { tableId: 't1', rowIndex: 1, fieldId: 'f1' } });
    const b = mkSession({ id: 'p1', cursor: { tableId: 't1', rowIndex: 2, fieldId: 'f1' } });
    expect(diffSessions([a], [b]).changed.map((s) => s.id)).toEqual(['p1']);
  });
});

describe('presence.join-policy', () => {
  it('drops oldest when user exceeds max per scope', () => {
    const t0 = new Date('2024-01-01T00:00:00Z');
    const t1 = new Date('2024-01-01T00:00:01Z');
    const t2 = new Date('2024-01-01T00:00:02Z');
    const sessions = [
      mkSession({ id: 'a', userId: 'u', connectedAt: t0 }),
      mkSession({ id: 'b', userId: 'u', connectedAt: t1 }),
      mkSession({ id: 'c', userId: 'u', connectedAt: t2 }),
    ];
    const drop = applyJoinPolicy(sessions, {
      userId: 'u',
      scope: 'base',
      scopeId: 'b1',
    });
    expect(drop.map((s) => s.id)).toEqual(['a']);
  });

  it('does not drop when under cap', () => {
    const sessions = [mkSession({ id: 'a' }), mkSession({ id: 'b' })];
    const drop = applyJoinPolicy(sessions, { userId: 'u', scope: 'base', scopeId: 'b1' });
    expect(drop).toHaveLength(0);
  });

  it('does not drop other users in the same scope', () => {
    const a = mkSession({ id: 'a', userId: 'u1' });
    const b = mkSession({ id: 'b', userId: 'u2' });
    const drop = applyJoinPolicy([a, b, a, b, a, b], {
      userId: 'u3',
      scope: 'base',
      scopeId: 'b1',
    });
    expect(drop).toHaveLength(0);
  });
});

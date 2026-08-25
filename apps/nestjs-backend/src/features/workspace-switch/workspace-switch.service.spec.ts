import {
  buildSessionRow,
  computeEffectiveRole,
  coerceRole,
  evaluateConsumption,
  generateSwitchToken,
  hashSwitchToken,
  isGrantActive,
  resolveGrantExpiresAt,
  resolveTtlMs,
  ROLE_RANK,
  verifyToken,
} from './workspace-switch.service';

describe('Workspace switch helpers (Stage 27)', () => {
  describe('generateSwitchToken', () => {
    it('produces a wss_ prefixed 96-char hex token', () => {
      const t = generateSwitchToken();
      expect(t).toMatch(/^wss_[a-f0-9]{48}$/);
    });

    it('produces unique tokens across calls', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 32; i++) seen.add(generateSwitchToken());
      expect(seen.size).toBe(32);
    });
  });

  describe('hashSwitchToken', () => {
    it('returns a 64-char SHA-256 hex digest', () => {
      const h = hashSwitchToken('wss_abc');
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic', () => {
      expect(hashSwitchToken('wss_abc')).toBe(hashSwitchToken('wss_abc'));
    });
  });

  describe('verifyToken', () => {
    it('returns true for a matching token', () => {
      const raw = generateSwitchToken();
      const stored = hashSwitchToken(raw);
      expect(verifyToken(raw, stored)).toBe(true);
    });

    it('returns false for a different token', () => {
      const stored = hashSwitchToken(generateSwitchToken());
      expect(verifyToken(generateSwitchToken(), stored)).toBe(false);
    });

    it('returns false for differently-sized hashes', () => {
      expect(verifyToken('anything', 'short')).toBe(false);
    });
  });

  describe('resolveTtlMs', () => {
    it('clamps to [1s, 1h]', () => {
      expect(resolveTtlMs(0)).toBe(1_000);
      expect(resolveTtlMs(-5)).toBe(1_000);
      expect(resolveTtlMs(10_000)).toBe(3_600_000);
    });

    it('defaults to 5 minutes', () => {
      expect(resolveTtlMs(undefined)).toBe(5 * 60 * 1_000);
    });
  });

  describe('buildSessionRow', () => {
    it('persists the SHA-256 of the token and a future expiry', () => {
      const now = new Date('2026-08-25T00:00:00Z');
      const row = buildSessionRow({
        id: 'wss_1',
        userId: 'u1',
        fromSpaceId: 's1',
        toSpaceId: 's2',
        token: 'wss_abc',
        ttlSeconds: 60,
        now,
      });
      expect(row.token).toBe(hashSwitchToken('wss_abc'));
      expect(row.token).not.toBe('wss_abc');
      expect(row.expiresAt.getTime()).toBe(now.getTime() + 60_000);
      expect(row.consumedAt).toBeNull();
    });
  });

  describe('evaluateConsumption', () => {
    const base = {
      id: 'wss_1',
      userId: 'u1',
      fromSpaceId: 's1',
      toSpaceId: 's2',
      token: 'h',
      expiresAt: new Date('2026-08-25T01:00:00Z'),
      consumedAt: null as Date | null,
      createdTime: new Date('2026-08-25T00:00:00Z'),
    };

    it('allows when unconsumed and not expired', () => {
      const r = evaluateConsumption({
        session: base,
        now: new Date('2026-08-25T00:30:00Z'),
      });
      expect(r).toEqual({ ok: true, toSpaceId: 's2', reason: 'consumed' });
    });

    it('rejects when already consumed', () => {
      const r = evaluateConsumption({
        session: { ...base, consumedAt: new Date('2026-08-25T00:10:00Z') },
        now: new Date('2026-08-25T00:30:00Z'),
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('expired');
    });

    it('rejects when expired', () => {
      const r = evaluateConsumption({
        session: base,
        now: new Date('2026-08-25T02:00:00Z'),
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('expired');
    });

    it('rejects when session is missing', () => {
      const r = evaluateConsumption({ session: null, now: new Date() });
      expect(r.reason).toBe('unknown');
    });
  });

  describe('computeEffectiveRole', () => {
    it('returns the base role when no cross-org grant exists', () => {
      expect(computeEffectiveRole({ baseRole: 'admin', crossOrgRole: null })).toEqual({
        baseRole: 'admin',
        elevated: false,
        effective: 'admin',
      });
    });

    it('promotes to the cross-org role when it is higher than base', () => {
      const r = computeEffectiveRole({ baseRole: 'admin', crossOrgRole: 'owner' });
      expect(r.elevated).toBe(true);
      expect(r.effective).toBe('owner');
    });

    it('keeps the base role when it is already higher or equal', () => {
      const r1 = computeEffectiveRole({ baseRole: 'owner', crossOrgRole: 'admin' });
      expect(r1.effective).toBe('owner');
      expect(r1.elevated).toBe(false);
      const r2 = computeEffectiveRole({ baseRole: 'admin', crossOrgRole: 'admin' });
      expect(r2.effective).toBe('admin');
      expect(r2.elevated).toBe(false);
    });

    it('uses the cross-org role when base is null', () => {
      const r = computeEffectiveRole({ baseRole: null, crossOrgRole: 'admin' });
      expect(r.elevated).toBe(true);
      expect(r.effective).toBe('admin');
    });

    it('returns null when both are null', () => {
      expect(computeEffectiveRole({ baseRole: null, crossOrgRole: null })).toEqual({
        baseRole: null,
        elevated: false,
        effective: null,
      });
    });

    it('keeps ROLE_RANK ordered owner > admin', () => {
      expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    });
  });

  describe('coerceRole', () => {
    it('passes admin/owner through', () => {
      expect(coerceRole('admin')).toBe('admin');
      expect(coerceRole('owner')).toBe('owner');
    });
    it('returns null for unknown values', () => {
      expect(coerceRole('viewer')).toBeNull();
      expect(coerceRole(null)).toBeNull();
      expect(coerceRole(undefined)).toBeNull();
    });
  });

  describe('isGrantActive', () => {
    const base = { expiresAt: null as Date | null, revokedAt: null as Date | null };

    it('returns true when no expiry and no revoke', () => {
      expect(isGrantActive({ grant: base, now: new Date() })).toBe(true);
    });

    it('returns false when revoked', () => {
      expect(
        isGrantActive({
          grant: { ...base, revokedAt: new Date('2026-08-01T00:00:00Z') },
          now: new Date('2026-08-25T00:00:00Z'),
        })
      ).toBe(false);
    });

    it('returns false when expired', () => {
      expect(
        isGrantActive({
          grant: { ...base, expiresAt: new Date('2026-08-01T00:00:00Z') },
          now: new Date('2026-08-25T00:00:00Z'),
        })
      ).toBe(false);
    });
  });

  describe('resolveGrantExpiresAt', () => {
    it('returns null when no ttl', () => {
      expect(resolveGrantExpiresAt({ ttlSeconds: undefined })).toBeNull();
    });
    it('returns null when ttl <= 0', () => {
      expect(resolveGrantExpiresAt({ ttlSeconds: 0 })).toBeNull();
      expect(resolveGrantExpiresAt({ ttlSeconds: -1 })).toBeNull();
    });
    it('returns a future date when ttl > 0', () => {
      const now = new Date('2026-08-25T00:00:00Z');
      const e = resolveGrantExpiresAt({ ttlSeconds: 60, now });
      expect(e?.toISOString()).toBe('2026-08-25T00:01:00.000Z');
    });
  });
});

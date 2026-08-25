/**
 * License key self up/downgrade — pure helpers spec (Stage 82).
 */

import {
  appendAudit,
  buildAudit,
  changeDirection,
  cooldownStatus,
  isLicenseTier,
  isReachable,
  nextCooldownFrom,
  prorationPreview,
  tierRank,
  validateTierChange,
} from './license-key-self.service';
import { LICENSE_COOLDOWN_MS, LICENSE_TIER_RANK } from './license-key-self.types';

describe('license-key-self.isLicenseTier', () => {
  it('accepts', () => {
    expect(isLicenseTier('pro')).toBe(true);
    expect(isLicenseTier('enterprise')).toBe(true);
  });
  it('rejects', () => {
    expect(isLicenseTier('??')).toBe(false);
  });
});

describe('license-key-self.tierRank', () => {
  it('orders', () => {
    expect(tierRank('community')).toBe(0);
    expect(tierRank('enterprise')).toBe(3);
    expect(LICENSE_TIER_RANK['business']).toBe(2);
  });
});

describe('license-key-self.changeDirection', () => {
  it('detects', () => {
    expect(changeDirection('pro', 'business')).toBe('upgrade');
    expect(changeDirection('business', 'pro')).toBe('downgrade');
    expect(changeDirection('pro', 'pro')).toBe('lateral');
  });
});

describe('license-key-self.isReachable', () => {
  it('accepts any two different tiers', () => {
    expect(isReachable('community', 'enterprise')).toBe(true);
    expect(isReachable('pro', 'pro')).toBe(false);
  });
  it('rejects unknown tiers', () => {
    expect(isReachable('??' as never, 'pro')).toBe(false);
  });
});

describe('license-key-self.validateTierChange', () => {
  const base = {
    licenseId: 'lic1',
    from: 'pro' as const,
    to: 'business' as const,
    effectiveAt: '2026-01-15T00:00:00Z',
  };
  it('passes', () => {
    expect(validateTierChange(base, '2026-01-10T00:00:00Z')).toBeNull();
  });
  it('rejects same tier', () => {
    expect(validateTierChange({ ...base, to: 'pro' }, '2026-01-10T00:00:00Z')).toContain(
      'not allowed'
    );
  });
  it('rejects unknown tier', () => {
    expect(validateTierChange({ ...base, to: '??' as never }, '2026-01-10T00:00:00Z')).toContain(
      'unknown to tier'
    );
  });
  it('rejects far future effectiveAt', () => {
    expect(
      validateTierChange({ ...base, effectiveAt: '2027-12-31T00:00:00Z' }, '2026-01-10T00:00:00Z')
    ).toContain('beyond max schedule');
  });
});

describe('license-key-self.cooldownStatus', () => {
  it('can change when no prior', () => {
    const out = cooldownStatus(undefined, '2026-01-10T00:00:00Z');
    expect(out.canChange).toBe(true);
  });
  it('blocked when within cooldown', () => {
    const now = '2026-01-10T00:00:00Z';
    const last = new Date(Date.parse(now) - LICENSE_COOLDOWN_MS + 60_000).toISOString();
    const out = cooldownStatus(last, now);
    expect(out.canChange).toBe(false);
    expect(out.remainingMs).toBeGreaterThan(0);
  });
  it('allowed after cooldown', () => {
    const now = '2026-01-10T00:00:00Z';
    const last = new Date(Date.parse(now) - LICENSE_COOLDOWN_MS - 1).toISOString();
    const out = cooldownStatus(last, now);
    expect(out.canChange).toBe(true);
  });
});

describe('license-key-self.prorationPreview', () => {
  it('upgrades charge delta', () => {
    const out = prorationPreview({
      from: 'pro',
      to: 'business',
      cycleStart: '2026-01-01T00:00:00Z',
      effectiveAt: '2026-01-16T00:00:00Z',
      now: '2026-01-10T00:00:00Z',
    });
    expect(out.direction).toBe('upgrade');
    expect(out.fromCents).toBe(2400);
    expect(out.toCents).toBe(7900);
    expect(out.deltaCents).toBeGreaterThan(0);
  });
  it('lateral has zero delta', () => {
    const out = prorationPreview({
      from: 'pro',
      to: 'pro',
      cycleStart: '2026-01-01T00:00:00Z',
      effectiveAt: '2026-01-16T00:00:00Z',
      now: '2026-01-10T00:00:00Z',
    });
    expect(out.direction).toBe('lateral');
    expect(out.deltaCents).toBe(0);
  });
  it('community to pro is an upgrade', () => {
    const out = prorationPreview({
      from: 'community',
      to: 'pro',
      cycleStart: '2026-01-01T00:00:00Z',
      effectiveAt: '2026-01-16T00:00:00Z',
      now: '2026-01-10T00:00:00Z',
    });
    expect(out.direction).toBe('upgrade');
    expect(out.fromCents).toBe(0);
    expect(out.toCents).toBe(2400);
  });
});

describe('license-key-self.buildAudit', () => {
  it('captures direction', () => {
    const out = buildAudit({
      id: 'a1',
      request: {
        licenseId: 'l1',
        from: 'pro',
        to: 'enterprise',
        effectiveAt: '2026-02-01T00:00:00Z',
        reason: 'growth',
        actorId: 'u1',
      },
      createdAt: '2026-01-10T00:00:00Z',
    });
    expect(out.direction).toBe('upgrade');
    expect(out.reason).toBe('growth');
    expect(out.actorId).toBe('u1');
  });
});

describe('license-key-self.nextCooldownFrom', () => {
  it('adds cooldown ms', () => {
    const out = nextCooldownFrom('2026-01-10T00:00:00Z');
    const elapsed = Date.parse(out) - Date.parse('2026-01-10T00:00:00Z');
    expect(elapsed).toBe(LICENSE_COOLDOWN_MS);
  });
});

describe('license-key-self.appendAudit', () => {
  it('trims', () => {
    const start = Array.from({ length: 5 }, (_, i) =>
      buildAudit({
        id: `a${i}`,
        request: {
          licenseId: 'l1',
          from: 'pro',
          to: 'business',
          effectiveAt: `2026-01-0${i + 1}T00:00:00Z`,
        },
        createdAt: '2026-01-10T00:00:00Z',
      })
    );
    const next = appendAudit({
      history: start,
      audit: start[0]!,
      cap: 3,
    });
    expect(next.length).toBe(3);
  });
});

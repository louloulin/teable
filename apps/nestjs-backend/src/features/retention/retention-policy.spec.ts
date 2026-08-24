import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RETENTION_DAYS,
  MS_PER_DAY,
  getRetentionDaysForPlan,
  getRetentionDaysForPlanLike,
  getRetentionMsForPlan,
} from './retention-policy';

describe('retention-policy', () => {
  describe('getRetentionDaysForPlan matrix (AC-001..AC-005)', () => {
    // the public pricing-page matrix; everything below is derived from this
    // table, so this single block locks the whole feature down.
    const matrix: Array<[string, 'record' | 'automation', number]> = [
      // AC-001
      ['self_hosted', 'record', 14],
      ['free', 'record', 14],
      // AC-002
      ['pro', 'record', 365],
      // AC-003
      ['business', 'record', 1095],
      // AC-004
      ['business', 'automation', 365],
      // AC-005 first half
      ['self_hosted', 'automation', 14],
      ['free', 'automation', 14],
      ['pro', 'automation', 365],
    ];

    for (const [plan, kind, expected] of matrix) {
      it(`plan=${plan} kind=${kind} returns ${expected}`, () => {
        expect(getRetentionDaysForPlan(plan as never, kind)).toBe(expected);
      });
    }

    it('enterprise equals the business ceiling for both kinds', () => {
      // not in the pricing matrix but contractually "at least business"; this
      // assertion guards against a future refactor that accidentally
      // downgrades enterprise users.
      expect(getRetentionDaysForPlan('enterprise', 'record')).toBe(1095);
      expect(getRetentionDaysForPlan('enterprise', 'automation')).toBe(365);
    });

    it('business record retention differs from business automation', () => {
      // AC-004 is the only row where the same plan returns two different
      // values; without this test a refactor that accidentally collapses
      // `kind` would silently break the documented asymmetry.
      const recordDays = getRetentionDaysForPlan('business', 'record');
      const automationDays = getRetentionDaysForPlan('business', 'automation');
      expect(recordDays).not.toBe(automationDays);
      expect(recordDays).toBeGreaterThan(automationDays);
    });
  });

  describe('default fallback (AC-005 second half)', () => {
    it('unknown plan defaults to 14 days', () => {
      // the function must be total: a misconfigured plan must not throw on
      // the cleanup hot path.
      expect(getRetentionDaysForPlan('mystery-plan' as never, 'record')).toBe(DEFAULT_RETENTION_DAYS);
      expect(getRetentionDaysForPlan('' as never, 'automation')).toBe(DEFAULT_RETENTION_DAYS);
    });

    it('unknown kind defaults to 14 days', () => {
      expect(getRetentionDaysForPlan('pro', 'unknown-kind' as never)).toBe(DEFAULT_RETENTION_DAYS);
    });

    it('getRetentionDaysForPlanLike handles runtime strings safely', () => {
      // thin string-typed wrapper used by the automation-run cleanup stub;
      // it must never throw on a value coming back from the license/env.
      expect(getRetentionDaysForPlanLike('business', 'record')).toBe(1095);
      expect(getRetentionDaysForPlanLike('pro', 'automation')).toBe(365);
      expect(getRetentionDaysForPlanLike('garbage', 'garbage')).toBe(DEFAULT_RETENTION_DAYS);
    });
  });

  describe('getRetentionMsForPlan', () => {
    it('multiplies days by 86_400_000 (one UTC day in ms)', () => {
      expect(getRetentionMsForPlan('pro', 'record')).toBe(365 * MS_PER_DAY);
      expect(getRetentionMsForPlan('business', 'record')).toBe(1095 * MS_PER_DAY);
      expect(getRetentionMsForPlan('business', 'automation')).toBe(365 * MS_PER_DAY);
    });

    it('applies the fallback default to ms output too', () => {
      expect(getRetentionMsForPlan('not-a-plan' as never, 'record')).toBe(
        DEFAULT_RETENTION_DAYS * MS_PER_DAY
      );
    });
  });

  describe('exported constants', () => {
    it('MS_PER_DAY matches a real UTC day', () => {
      // 24h * 60m * 60s * 1000ms = 86_400_000
      expect(MS_PER_DAY).toBe(86_400_000);
    });

    it('DEFAULT_RETENTION_DAYS is the conservative floor', () => {
      // explicit value rather than a computed one so a careless refactor
      // cannot accidentally raise the floor.
      expect(DEFAULT_RETENTION_DAYS).toBe(14);
    });
  });
});

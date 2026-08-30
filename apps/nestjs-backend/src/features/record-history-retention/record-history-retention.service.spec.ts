/* eslint-disable @typescript-eslint/naming-convention */
import {
  PLAN_RETENTION_POLICIES,
  describeResolution,
  isExpired,
  listPolicies,
  suggestCron,
  resolveRetention,
} from './record-history-retention.service';
import type { ISubscriberContext } from './record-history-retention.types';

describe('record-history-retention.resolveRetention', () => {
  it('uses tier defaults', () => {
    const out = resolveRetention({ tier: 'free' });
    expect(out.retentionDays).toBe(14);
    expect(out.overridden).toBe(false);
    expect(out.purgeCron).toBe('0 3 * * *');
  });
  it('uses pro tier 365-day window', () => {
    const out = resolveRetention({ tier: 'pro' });
    expect(out.retentionDays).toBe(365);
  });
  it('uses business tier 1095-day window', () => {
    const out = resolveRetention({ tier: 'business' });
    expect(out.retentionDays).toBe(1095);
  });
  it('uses self-hosted tier 14-day window', () => {
    const out = resolveRetention({ tier: 'self_hosted' });
    expect(out.retentionDays).toBe(14);
    expect(out.maxRecordsPerBase).toBe(0);
  });
  it('uses enterprise tier 1095-day window', () => {
    const out = resolveRetention({ tier: 'enterprise' });
    expect(out.retentionDays).toBe(1095);
    expect(out.maxRecordsPerBase).toBe(0);
  });
  it('honours a positive override', () => {
    const out = resolveRetention({ tier: 'free', overrideDays: 60 });
    expect(out.retentionDays).toBe(60);
    expect(out.overridden).toBe(true);
  });
  it('ignores a zero / negative override', () => {
    const out = resolveRetention({ tier: 'pro', overrideDays: 0 });
    expect(out.retentionDays).toBe(365);
    expect(out.overridden).toBe(false);
  });
  it('enterprise override sets unlimited', () => {
    const out = resolveRetention({ tier: 'free', enterpriseOverride: true });
    expect(out.retentionDays).toBe(Infinity);
    expect(out.maxRecordsPerBase).toBe(0);
    expect(out.overridden).toBe(true);
  });
});

describe('record-history-retention.isExpired', () => {
  const resolved = resolveRetention({ tier: 'pro' });
  it('flags rows older than the retention window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const old = new Date(now.getTime() - 400 * 86400000);
    expect(isExpired(old, resolved, now)).toBe(true);
  });
  it('keeps rows inside the window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const fresh = new Date(now.getTime() - 5 * 86400000);
    expect(isExpired(fresh, resolved, now)).toBe(false);
  });
  it('never expires when retention is unlimited', () => {
    const unlimited = resolveRetention({ tier: 'free', enterpriseOverride: true });
    const veryOld = new Date(0);
    expect(isExpired(veryOld, unlimited)).toBe(false);
  });
});

describe('record-history-retention.suggestCron', () => {
  it('picks night cron for short retention', () => {
    expect(suggestCron(7)).toBe('0 3 * * *');
  });
  it('picks earlier cron for medium retention', () => {
    expect(suggestCron(120)).toBe('0 2 * * *');
  });
  it('picks midnight cron for long retention', () => {
    expect(suggestCron(400)).toBe('0 1 * * *');
  });
});

describe('record-history-retention.helpers', () => {
  it('lists all 5 tier policies', () => {
    const policies = listPolicies();
    expect(policies).toHaveLength(5);
    expect(policies.map((p) => p.tier)).toEqual([
      'self_hosted',
      'free',
      'pro',
      'business',
      'enterprise',
    ]);
  });
  it('exposes PLAN_RETENTION_POLICIES as a record', () => {
    expect(PLAN_RETENTION_POLICIES.business.retentionDays).toBe(1095);
  });
  it('describes resolutions', () => {
    expect(describeResolution(resolveRetention({ tier: 'pro' }))).toContain('pro tier');
    expect(
      describeResolution(resolveRetention({ tier: 'free', enterpriseOverride: true }))
    ).toContain('unlimited');
  });
});

describe('record-history-retention.describe (integration)', () => {
  it('runs an integration check without prisma', () => {
    const ctx: ISubscriberContext = { tier: 'pro' };
    const resolved = resolveRetention(ctx);
    expect(resolved.retentionDays).toBe(365);
    expect(resolved.overridden).toBe(false);
  });
});

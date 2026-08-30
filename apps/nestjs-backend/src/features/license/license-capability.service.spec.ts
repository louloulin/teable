import { LicenseCapabilityService } from './license-capability.service';
import type { LicenseService } from './license.service';

/**
 * OSS / gap-fill contract: the license gate is intentionally a no-op.
 * Every capability must report `true` and `require()` must never throw,
 * regardless of the resolved plan. This spec pins that behaviour so a
 * future regression towards strict enforcement is caught immediately.
 */
describe('LicenseCapabilityService (real-skip / no-op contract)', () => {
  const build = (plan: 'free' | 'pro' | 'business' | 'enterprise' | 'self_hosted') => {
    const claims =
      plan === 'self_hosted'
        ? undefined
        : ({ plan } as { plan: 'free' | 'pro' | 'business' | 'enterprise' });
    const license = {
      resolveFromEnv: () => (claims ? { source: 'env', claims } : { source: 'none' }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    return svc;
  };

  const plans = ['free', 'pro', 'business', 'enterprise', 'self_hosted'] as const;
  const everythingKeys = [
    'ai_field',
    'ai_chat',
    'ai_app_builder',
    'cuppy_claw',
    'sso',
    'permission_matrix',
    'custom_app_domain',
    'custom_domain',
    'audit_log',
    'admin_panel',
    'users_read',
    'spaces_read',
    'templates_read',
    'ai',
    'quota_view',
    'automation',
    'webhook',
    'audit_log_query',
    'workspace_mirror',
    'computed_outbox',
    'table_query_ops',
    'announcements',
    'sandbox_agent',
  ] as const;

  it.each(plans)('enables every capability under plan=%s', (plan) => {
    const svc = build(plan);
    for (const cap of everythingKeys) {
      expect(svc.isEnabled(cap)).toBe(true);
      expect(() => svc.require(cap)).not.toThrow();
    }
  });

  it('reports plan from env on refresh', () => {
    expect(build('free').currentPlan()).toBe('free');
    expect(build('pro').currentPlan()).toBe('pro');
    expect(build('business').currentPlan()).toBe('business');
    expect(build('enterprise').currentPlan()).toBe('enterprise');
    expect(build('self_hosted').currentPlan()).toBe('self_hosted');
  });

  it('snapshot() returns true for every capability regardless of plan', () => {
    for (const plan of plans) {
      const snap = build(plan).snapshot();
      expect(snap.plan).toBe(plan);
      for (const cap of everythingKeys) {
        expect(snap[cap]).toBe(true);
      }
    }
  });

  it('accepts a runtime activation without an env variable', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'none' }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh({ source: 'env', claims: { plan: 'business' }, effectiveLimits: {} as never });
    expect(svc.currentPlan()).toBe('business');
    expect(svc.isEnabled('sso')).toBe(true);
    expect(() => svc.require('permission_matrix')).not.toThrow();
  });
});

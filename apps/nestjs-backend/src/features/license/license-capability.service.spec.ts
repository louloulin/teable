import { LicenseCapabilityService } from './license-capability.service';
import type { LicenseService } from './license.service';

describe('LicenseCapabilityService plan contract', () => {
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

  it('keeps all local capabilities enabled for self-hosted instances', () => {
    const svc = build('self_hosted');
    for (const cap of everythingKeys) {
      expect(svc.isEnabled(cap)).toBe(true);
      expect(() => svc.require(cap)).not.toThrow();
    }
  });

  it('enforces the published capability matrix for licensed plans', () => {
    const svc = build('free');
    expect(svc.isEnabled('ai_chat')).toBe(true);
    expect(svc.isEnabled('billing')).toBe(false);
    expect(() => svc.require('billing')).toThrow(/requires a license upgrade/);

    const business = build('business');
    expect(business.isEnabled('billing')).toBe(true);
    expect(business.isEnabled('byok_llm_key')).toBe(false);
  });

  it('reports disabled capabilities in snapshot', () => {
    const svc = build('pro');
    expect(svc.snapshot().audit_log).toBe(true);
    expect(svc.snapshot().billing).toBe(false);
    expect(svc.snapshot().byok_llm_key).toBe(false);
  });

  it('enables every capability under enterprise and self-hosted plans', () => {
    for (const plan of ['enterprise', 'self_hosted'] as const) {
    const svc = build(plan);
    for (const cap of everythingKeys) {
      expect(svc.isEnabled(cap)).toBe(true);
      expect(() => svc.require(cap)).not.toThrow();
    }
    }
  });

  it('reports plan from env on refresh', () => {
    expect(build('free').currentPlan()).toBe('free');
    expect(build('pro').currentPlan()).toBe('pro');
    expect(build('business').currentPlan()).toBe('business');
    expect(build('enterprise').currentPlan()).toBe('enterprise');
    expect(build('self_hosted').currentPlan()).toBe('self_hosted');
  });

  it('snapshot() reflects the plan', () => {
    for (const plan of plans) expect(build(plan).snapshot().plan).toBe(plan);
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

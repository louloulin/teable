import { HttpErrorCode } from '@teable/core';
import { CustomHttpException } from '../../custom.exception';
import { LicenseCapabilityService } from './license-capability.service';
import type { LicenseService } from './license.service';

describe('LicenseCapabilityService', () => {
  it('enables every capability under self-hosted OSS without a license', () => {
    const license = { resolveFromEnv: () => ({ source: 'none' }) } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    expect(svc.currentPlan()).toBe('self_hosted');
    expect(svc.isEnabled('ai_chat')).toBe(true);
    expect(svc.isEnabled('permission_matrix')).toBe(true);
    expect(svc.isEnabled('automation')).toBe(true);
    expect(svc.isEnabled('webhook')).toBe(true);
    expect(svc.isEnabled('audit_log_query')).toBe(true);
    expect(() => svc.require('sso')).not.toThrow();
  });

  it('enables ai_chat under free plan', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'env', claims: { plan: 'free' } }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    expect(svc.isEnabled('ai_chat')).toBe(true);
    expect(svc.isEnabled('ai_field')).toBe(true);
    expect(svc.isEnabled('ai_app_builder')).toBe(true);
    expect(svc.isEnabled('cuppy_claw')).toBe(true);
    expect(svc.isEnabled('sso')).toBe(false);
    expect(svc.isEnabled('permission_matrix')).toBe(false);
  });

  it('enables all AI capabilities + audit under pro', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'env', claims: { plan: 'pro' } }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    expect(svc.isEnabled('ai_field')).toBe(true);
    expect(svc.isEnabled('ai_chat')).toBe(true);
    expect(svc.isEnabled('ai_app_builder')).toBe(true);
    expect(svc.isEnabled('cuppy_claw')).toBe(true);
    expect(svc.isEnabled('audit_log')).toBe(true);
    expect(svc.isEnabled('permission_matrix')).toBe(false);
  });

  it('enables everything under business', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'env', claims: { plan: 'business' } }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    const snap = svc.snapshot();
    expect(snap.plan).toBe('business');
    expect(snap.ai_field).toBe(true);
    expect(snap.sso).toBe(true);
    expect(snap.permission_matrix).toBe(true);
    expect(snap.custom_app_domain).toBe(true);
    expect(snap.admin_panel).toBe(true);
  });

  it('throws on require() for missing capabilities', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'env', claims: { plan: 'free' } }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    try {
      svc.require('sso');
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(CustomHttpException);
      expect((err as CustomHttpException).code).toBe(HttpErrorCode.PAYMENT_REQUIRED);
    }
  });

  it('accepts a runtime activation without requiring an environment variable', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'none' }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh({ source: 'env', claims: { plan: 'business' }, effectiveLimits: {} as never });
    expect(svc.currentPlan()).toBe('business');
    expect(svc.isEnabled('sso')).toBe(true);
  });
});

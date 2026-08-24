import { Test } from '@nestjs/testing';

import { HttpErrorCode } from '@teable/core';
import { CustomHttpException } from '../../custom.exception';
import { LicenseCapabilityService } from './license-capability.service';
import { LicenseService } from './license.service';

describe('LicenseCapabilityService', () => {
  it('disables every capability under the OSS default (no license)', () => {
    const license = { resolveFromEnv: () => ({ source: 'none' }) } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    expect(svc.currentPlan()).toBe('self_hosted');
    expect(svc.isEnabled('ai_chat')).toBe(false);
    expect(svc.isEnabled('permission_matrix')).toBe(false);
    expect(() => svc.require('sso')).toThrow(CustomHttpException);
  });

  it('enables ai_chat under free plan', () => {
    const license = {
      resolveFromEnv: () => ({ source: 'env', claims: { plan: 'free' } }),
    } as unknown as LicenseService;
    const svc = new LicenseCapabilityService(license);
    svc.refresh();
    expect(svc.isEnabled('ai_chat')).toBe(true);
    expect(svc.isEnabled('ai_field')).toBe(false);
    expect(svc.isEnabled('sso')).toBe(false);
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
});
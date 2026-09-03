/* eslint-disable @typescript-eslint/naming-convention */
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingPortalOrgGuard } from './billing-portal-org.guard';

interface IMockCls {
  get: ReturnType<typeof vi.fn>;
}

const buildCtx = (req: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http',
  }) as unknown as ExecutionContext;

const buildGuard = (cls: IMockCls): BillingPortalOrgGuard =>
  new BillingPortalOrgGuard(cls as unknown as ConstructorParameters<typeof BillingPortalOrgGuard>[0]);

describe('BillingPortalOrgGuard (Phase 6 follow-up)', () => {
  let cls: IMockCls;

  beforeEach(() => {
    cls = { get: vi.fn() };
  });

  it('R-ORGGUARD-1: missing organizationId → 403', () => {
    cls.get.mockReturnValue({ id: 'u1', organizationId: 'org_1' });
    const guard = buildGuard(cls);
    expect(() => guard.canActivate(buildCtx({ query: {}, body: {} }))).toThrow(
      ForbiddenException
    );
  });

  it('R-ORGGUARD-2: missing user (anonymous) → 403', () => {
    cls.get.mockReturnValue(undefined);
    const guard = buildGuard(cls);
    expect(() =>
      guard.canActivate(buildCtx({ query: { organizationId: 'org_1' } }))
    ).toThrow(/authenticated user required/);
  });

  it('R-ORGGUARD-3: user without id → 403', () => {
    cls.get.mockReturnValue({ id: '', organizationId: 'org_1' });
    const guard = buildGuard(cls);
    expect(() =>
      guard.canActivate(buildCtx({ query: { organizationId: 'org_1' } }))
    ).toThrow(/authenticated user required/);
  });

  it('R-ORGGUARD-4: user belonging to a different org → 403 (no info leak)', () => {
    cls.get.mockReturnValue({ id: 'u1', organizationId: 'org_other' });
    const guard = buildGuard(cls);
    expect(() =>
      guard.canActivate(buildCtx({ query: { organizationId: 'org_target' } }))
    ).toThrow(ForbiddenException);
  });

  it('R-ORGGUARD-5: user without organizationId (cross-org admin not set) → 403', () => {
    cls.get.mockReturnValue({ id: 'u1' });
    const guard = buildGuard(cls);
    expect(() =>
      guard.canActivate(buildCtx({ query: { organizationId: 'org_1' } }))
    ).toThrow(ForbiddenException);
  });

  it('R-ORGGUARD-6: matching organizationId → allow', () => {
    cls.get.mockReturnValue({ id: 'u1', organizationId: 'org_1' });
    const guard = buildGuard(cls);
    expect(
      guard.canActivate(buildCtx({ query: { organizationId: 'org_1' } }))
    ).toBe(true);
  });

  it('R-ORGGUARD-7: admin (isAdmin=true) bypasses per-org check', () => {
    cls.get.mockReturnValue({ id: 'admin1', organizationId: 'org_admin', isAdmin: true });
    const guard = buildGuard(cls);
    expect(
      guard.canActivate(buildCtx({ query: { organizationId: 'org_any_other' } }))
    ).toBe(true);
  });

  it('R-ORGGUARD-8: organizationId from body works for POST routes', () => {
    cls.get.mockReturnValue({ id: 'u1', organizationId: 'org_1' });
    const guard = buildGuard(cls);
    expect(
      guard.canActivate(buildCtx({ body: { organizationId: 'org_1' } }))
    ).toBe(true);
  });

  it('R-ORGGUARD-9: query takes precedence when both query and body provide orgId', () => {
    cls.get.mockReturnValue({ id: 'u1', organizationId: 'org_query' });
    const guard = buildGuard(cls);
    // query says org_query (match), body says org_body (mismatch) → still allow.
    expect(
      guard.canActivate(
        buildCtx({ query: { organizationId: 'org_query' }, body: { organizationId: 'org_body' } })
      )
    ).toBe(true);
  });

  it('R-ORGGUARD-10: numeric organizationId is ignored (string-only)', () => {
    cls.get.mockReturnValue({ id: 'u1', organizationId: 'org_1' });
    const guard = buildGuard(cls);
    expect(() =>
      guard.canActivate(buildCtx({ query: { organizationId: 42 as unknown as string } }))
    ).toThrow(ForbiddenException);
  });
});

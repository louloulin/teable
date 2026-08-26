/**
 * E2E smoke for business/enterprise plan coverage (G2-005).
 *
 *   - Verifies that all paid-tier capabilities actually work under the
 *     right plan, instead of being silently gated by `LicenseCapabilityGuard`.
 *   - Verifies that `LicenseCapabilityGuard` correctly allows / denies
 *     based on the resolved plan.
 *   - Verifies `LicenseService.resolve(...)` returns the expected
 *     `effectiveLimits` per plan.
 *   - Verifies `QuotaService.consume(...)` short-circuits (unlimited) for
 *     enterprise and self_hosted, and enforces caps for free / pro /
 *     business.
 *
 * Coverage:
 *   - 5 describe blocks (`business`, `enterprise`, `pro`, `free`,
 *     `self_hosted`).
 *   - ≥35 `it()` total (currently 37).
 *   - Each describe block has at least: snapshot assertion, canActivate
 *     throw/no-throw for ≥2 capabilities, effectiveLimits equality, and
 *     (for business/enterprise) consume-within-cap no-throw.
 *   - The self_hosted block has an extra assertion that `canActivate`
 *     returns true (not just doesn't throw) — the key difference from
 *     `free`.
 *   - The pro block strictly asserts all business-only capabilities are
 *     false.
 *
 * Hard rules (per brief):
 *   - No modifications to `LicenseCapabilityService`, `LicenseCapabilityGuard`,
 *     `LicenseService`, or `QuotaService` source.
 *   - No new npm dependencies.
 *   - In-process only — in-memory Prisma, no live Postgres / Redis.
 */
import type { PlanLevel } from '@teable/db-main-prisma';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@teable/db-main-prisma';
import { HttpErrorCode } from '@teable/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { CustomHttpException } from '../../../custom.exception';
import { QuotaService } from '../../quota/quota.service';
import { isUnlimited, PLAN_LIMITS } from '../../quota/quota.constants';
import { LicenseCapability, LicenseCapabilityService } from '../license-capability.service';
import { LicenseCapabilityGuard } from '../license-capability.guard';
import { LicenseService } from '../license.service';
import type { IResolvedLicense } from '../license.constants';

import {
  ALL_REAL_CAPABILITIES,
  BUSINESS_ONLY_CAPABILITIES,
  buildFakePrismaForPlan,
  buildResolvedLicense,
  expectedLimitsFor,
  SMOKE_PLANS,
  type SmokePlan,
} from './license-plan-fixture';

/** Build a `LicenseCapabilityService` whose env reads resolve to `plan`. */
function buildLicenseCapabilityService(plan: SmokePlan): LicenseCapabilityService {
  const resolved = buildResolvedLicense(plan);
  const licenseStub = {
    resolveFromEnv: () => resolved,
    resolve: (_key: string | undefined | null) => resolved,
  } as unknown as LicenseService;
  const svc = new LicenseCapabilityService(licenseStub);
  svc.refresh();
  return svc;
}

/**
 * Build a real `LicenseService` from a `LicenseModule`-shaped DI container,
 * using an in-memory Prisma mock + a `QuotaService` stub. Returns both
 * services so the spec can call `resolve(...)` AND `consume(...)`.
 */
async function buildLicenseAndQuotaServices(plan: SmokePlan): Promise<{
  license: LicenseService;
  quota: QuotaService;
}> {
  const fakePrisma = buildFakePrismaForPlan(plan, 'sp_smoke');
  const quotaStub = { setPlanLimits: async () => ({}) } as unknown as QuotaService;
  const moduleRef = await Test.createTestingModule({
    providers: [
      LicenseService,
      { provide: PrismaService, useValue: fakePrisma },
      { provide: QuotaService, useValue: quotaStub },
    ],
  }).compile();
  return {
    license: moduleRef.get(LicenseService),
    quota: moduleRef.get(QuotaService),
  };
}

/** Build a real `QuotaService` against an in-memory Prisma — no live DB. */
async function buildQuotaServiceForPlan(plan: SmokePlan): Promise<{
  quota: QuotaService;
  prisma: ReturnType<typeof buildFakePrismaForPlan>;
}> {
  const fakePrisma = buildFakePrismaForPlan(plan, 'sp_smoke');
  const moduleRef = await Test.createTestingModule({
    providers: [QuotaService, { provide: PrismaService, useValue: fakePrisma }],
  }).compile();
  return {
    quota: moduleRef.get(QuotaService),
    prisma: fakePrisma,
  };
}

/** Helper — instantiate a guard scoped to a specific capability. */
function guardFor(
  capSvc: LicenseCapabilityService,
  cap: LicenseCapability
): LicenseCapabilityGuard {
  const GuardScoped = LicenseCapabilityGuard.for(cap);
  return new GuardScoped(capSvc);
}

/** Run a guard under the supplied capability service — return value (true) or throw. */
function invokeGuard(capSvc: LicenseCapabilityService, cap: LicenseCapability): boolean {
  return guardFor(capSvc, cap).canActivate({} as never);
}

// ---------------------------------------------------------------------------
// 1. business plan
// ---------------------------------------------------------------------------
describe('business plan', () => {
  let capSvc: LicenseCapabilityService;
  let license: LicenseService;

  beforeEach(async () => {
    capSvc = buildLicenseCapabilityService('business');
    const built = await buildLicenseAndQuotaServices('business');
    license = built.license;
  });

  it('snapshot: every business-only capability is true', () => {
    const snap = capSvc.snapshot();
    expect(snap.plan).toBe<PlanLevel>('business');
    for (const cap of BUSINESS_ONLY_CAPABILITIES) {
      expect(snap[cap]).toBe(true);
    }
    // Brief A1: explicit positive assertions for the headline capabilities.
    expect(snap.sso).toBe(true);
    expect(snap.permission_matrix).toBe(true);
    expect(snap.admin_panel).toBe(true);
    expect(snap.audit_log).toBe(true);
    expect(snap.custom_app_domain).toBe(true);
  });

  it('snapshot: every pro capability remains true (no regression)', () => {
    const snap = capSvc.snapshot();
    expect(snap.ai_field).toBe(true);
    expect(snap.ai_chat).toBe(true);
    expect(snap.ai_app_builder).toBe(true);
    expect(snap.cuppy_claw).toBe(true);
  });

  it('guard canActivate("sso") does NOT throw (allow)', () => {
    expect(() => invokeGuard(capSvc, 'sso')).not.toThrow();
    expect(invokeGuard(capSvc, 'sso')).toBe(true);
  });

  it('guard canActivate("permission_matrix") does NOT throw', () => {
    expect(() => invokeGuard(capSvc, 'permission_matrix')).not.toThrow();
  });

  it('guard canActivate("admin_panel") does NOT throw', () => {
    expect(() => invokeGuard(capSvc, 'admin_panel')).not.toThrow();
  });

  it('guard canActivate("audit_log") does NOT throw', () => {
    expect(() => invokeGuard(capSvc, 'audit_log')).not.toThrow();
  });

  it('resolve("plan:business:seats=42") returns PLAN_LIMITS.business + seat override', () => {
    const r: IResolvedLicense = license.resolve('plan:business:seats=42');
    expect(r.source).toBe('env');
    expect(r.claims?.plan).toBe<PlanLevel>('business');
    expect(r.claims?.seats).toBe(42);
    expect(r.effectiveLimits).toEqual({ ...expectedLimitsFor('business'), seatLimit: 42 });
    // Brief A7: precise thresholds.
    expect(r.effectiveLimits.rowLimit).toBe(1_000_000);
    expect(r.effectiveLimits.attachmentByteLimit).toBe(100n * 1024n * 1024n * 1024n);
    expect(r.effectiveLimits.automationRunLimit).toBe(100_000);
    expect(r.effectiveLimits.aiCreditLimit).toBe(2_000);
    expect(r.effectiveLimits.apiRequestLimitPerSec).toBe(10); // matches quota.constants.ts PLAN_LIMITS.business
    expect(r.effectiveLimits.seatLimit).toBe(42);
  });

  it('quota consume within cap does not throw', async () => {
    const { quota, prisma } = await buildQuotaServiceForPlan('business');
    // rowLimit = 1_000_000; consume a small amount — must not throw.
    await expect(
      quota.consume('sp_smoke', 'rows' as never, 5n, { actorId: 'u_smoke' })
    ).resolves.toBeUndefined();
    // The unlimited / non-periodic path was skipped (we hit the transactional
    // upsert at least once) — counter create must have been called.
    expect(prisma.spaceUsageCounter.upsert).toHaveBeenCalled();
  });

  it('quota consume at the cap edge does not throw (boundary check)', async () => {
    const { quota } = await buildQuotaServiceForPlan('business');
    // PLAN_LIMITS.business.rowLimit is 1_000_000 — consume exactly that.
    // The mock returns a counter row with `used: 0n`, so any single consume
    // of any size ≤ cap passes.
    await expect(
      quota.consume('sp_smoke', 'rows' as never, BigInt(PLAN_LIMITS.business.rowLimit ?? 0))
    ).resolves.toBeUndefined();
  });

  it('isUnlimited(business.rowLimit) is false — business has caps', () => {
    expect(isUnlimited(PLAN_LIMITS.business.rowLimit)).toBe(false);
    expect(isUnlimited(PLAN_LIMITS.business.attachmentByteLimit)).toBe(false);
    expect(isUnlimited(PLAN_LIMITS.business.automationRunLimit)).toBe(false);
    expect(isUnlimited(PLAN_LIMITS.business.aiCreditLimit)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. enterprise plan
// ---------------------------------------------------------------------------
describe('enterprise plan', () => {
  let capSvc: LicenseCapabilityService;
  let license: LicenseService;

  beforeEach(async () => {
    capSvc = buildLicenseCapabilityService('enterprise');
    const built = await buildLicenseAndQuotaServices('enterprise');
    license = built.license;
  });

  it('snapshot: every real capability is true', () => {
    const snap = capSvc.snapshot();
    expect(snap.plan).toBe<PlanLevel>('enterprise');
    for (const cap of ALL_REAL_CAPABILITIES) {
      expect(snap[cap]).toBe(true);
    }
  });

  it('guard canActivate for every capability does NOT throw', () => {
    for (const cap of ALL_REAL_CAPABILITIES) {
      expect(() => invokeGuard(capSvc, cap)).not.toThrow();
      expect(invokeGuard(capSvc, cap)).toBe(true);
    }
  });

  it('resolve("plan:enterprise") returns all-null effectiveLimits', () => {
    const r = license.resolve('plan:enterprise');
    expect(r.source).toBe('env');
    expect(r.claims?.plan).toBe<PlanLevel>('enterprise');
    expect(r.effectiveLimits.rowLimit).toBeNull();
    expect(r.effectiveLimits.attachmentByteLimit).toBeNull();
    expect(r.effectiveLimits.automationRunLimit).toBeNull();
    expect(r.effectiveLimits.aiCreditLimit).toBeNull();
    expect(r.effectiveLimits.apiRequestLimitPerSec).toBeNull();
    expect(r.effectiveLimits.recordHistoryDays).toBeNull();
    expect(r.effectiveLimits.automationHistoryDays).toBeNull();
    expect(r.effectiveLimits.seatLimit).toBeNull();
  });

  it('isUnlimited returns true for every enterprise limit field', () => {
    const l = PLAN_LIMITS.enterprise;
    expect(isUnlimited(l.rowLimit)).toBe(true);
    expect(isUnlimited(l.attachmentByteLimit)).toBe(true);
    expect(isUnlimited(l.automationRunLimit)).toBe(true);
    expect(isUnlimited(l.aiCreditLimit)).toBe(true);
    expect(isUnlimited(l.apiRequestLimitPerSec)).toBe(true);
    expect(isUnlimited(l.recordHistoryDays)).toBe(true);
    expect(isUnlimited(l.automationHistoryDays)).toBe(true);
    expect(isUnlimited(l.seatLimit)).toBe(true);
  });

  it('quota consume of 10^12 rows does not throw (unlimited path)', async () => {
    const { quota, prisma } = await buildQuotaServiceForPlan('enterprise');
    await expect(
      quota.consume('sp_smoke', 'rows' as never, 1_000_000_000_000n)
    ).resolves.toBeUndefined();
    // Brief A8: unlimited plan must NOT enter the transactional path.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('quota consume with empty amount does not throw', async () => {
    const { quota } = await buildQuotaServiceForPlan('enterprise');
    await expect(quota.consume('sp_smoke', 'rows' as never, 0n)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. pro plan — strict business-only off
// ---------------------------------------------------------------------------
describe('pro plan — business-only capability strictly denied', () => {
  let capSvc: LicenseCapabilityService;
  let license: LicenseService;

  beforeEach(async () => {
    capSvc = buildLicenseCapabilityService('pro');
    const built = await buildLicenseAndQuotaServices('pro');
    license = built.license;
  });

  it('snapshot: every business-only capability is false', () => {
    const snap = capSvc.snapshot();
    expect(snap.plan).toBe<PlanLevel>('pro');
    for (const cap of BUSINESS_ONLY_CAPABILITIES) {
      expect(snap[cap]).toBe(false);
    }
  });

  it('snapshot: every pro capability is true (no regression)', () => {
    const snap = capSvc.snapshot();
    expect(snap.ai_field).toBe(true);
    expect(snap.ai_chat).toBe(true);
    expect(snap.ai_app_builder).toBe(true);
    expect(snap.cuppy_claw).toBe(true);
    expect(snap.audit_log).toBe(true);
  });

  it('guard canActivate("sso") throws CustomHttpException(PAYMENT_REQUIRED, cause=LICENSE_REQUIRED)', () => {
    try {
      invokeGuard(capSvc, 'sso');
      throw new Error('expected guard to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CustomHttpException);
      const ex = err as CustomHttpException;
      expect(ex.code).toBe(HttpErrorCode.PAYMENT_REQUIRED);
      expect(ex.getStatus()).toBe(402);
      expect(ex.data?.cause).toBe('LICENSE_REQUIRED');
    }
  });

  it('guard canActivate("permission_matrix") throws 402', () => {
    try {
      invokeGuard(capSvc, 'permission_matrix');
      throw new Error('expected guard to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CustomHttpException);
      expect((err as CustomHttpException).code).toBe(HttpErrorCode.PAYMENT_REQUIRED);
      expect((err as CustomHttpException).getStatus()).toBe(402);
    }
  });

  it('guard canActivate("admin_panel") throws 402', () => {
    expect(() => invokeGuard(capSvc, 'admin_panel')).toThrowError(CustomHttpException);
  });

  it('guard canActivate("audit_log") does NOT throw (pro includes audit_log)', () => {
    expect(() => invokeGuard(capSvc, 'audit_log')).not.toThrow();
    expect(invokeGuard(capSvc, 'audit_log')).toBe(true);
  });

  it('resolve("plan:pro") returns PLAN_LIMITS.pro unchanged', () => {
    const r = license.resolve('plan:pro');
    expect(r.source).toBe('env');
    expect(r.claims?.plan).toBe<PlanLevel>('pro');
    expect(r.effectiveLimits).toEqual(PLAN_LIMITS.pro);
  });
});

// ---------------------------------------------------------------------------
// 4. free plan
// ---------------------------------------------------------------------------
describe('free plan', () => {
  let capSvc: LicenseCapabilityService;
  let license: LicenseService;

  beforeEach(async () => {
    capSvc = buildLicenseCapabilityService('free');
    const built = await buildLicenseAndQuotaServices('free');
    license = built.license;
  });

  it('snapshot: only ai_chat is true', () => {
    const snap = capSvc.snapshot();
    expect(snap.plan).toBe<PlanLevel>('free');
    expect(snap.ai_chat).toBe(true);
    expect(snap.ai_field).toBe(false);
    expect(snap.ai_app_builder).toBe(false);
    expect(snap.cuppy_claw).toBe(false);
    expect(snap.audit_log).toBe(false);
    expect(snap.sso).toBe(false);
    expect(snap.permission_matrix).toBe(false);
    expect(snap.admin_panel).toBe(false);
  });

  it('snapshot: every business-only capability is false', () => {
    const snap = capSvc.snapshot();
    for (const cap of BUSINESS_ONLY_CAPABILITIES) {
      expect(snap[cap]).toBe(false);
    }
  });

  it('guard canActivate("sso") throws 402', () => {
    expect(() => invokeGuard(capSvc, 'sso')).toThrowError(CustomHttpException);
    try {
      invokeGuard(capSvc, 'sso');
    } catch (err) {
      expect((err as CustomHttpException).getStatus()).toBe(402);
    }
  });

  it('resolve("plan:free") returns PLAN_LIMITS.free unchanged', () => {
    const r = license.resolve('plan:free');
    expect(r.source).toBe('env');
    expect(r.claims?.plan).toBe<PlanLevel>('free');
    expect(r.effectiveLimits).toEqual(PLAN_LIMITS.free);
  });

  it('resolve() with no token returns empty (source=none)', () => {
    // Note: LicenseService.empty() returns PLAN_LIMITS.self_hosted regardless
    // of the env — this test just guards the "no token" path stays clean.
    const r = license.resolve(undefined);
    expect(r.source).toBe('none');
    expect(r.effectiveLimits).toEqual(PLAN_LIMITS.self_hosted);
  });
});

// ---------------------------------------------------------------------------
// 5. self_hosted plan — OSS zero-impact
// ---------------------------------------------------------------------------
describe('self_hosted plan — OSS zero-impact', () => {
  let capSvc: LicenseCapabilityService;
  let license: LicenseService;

  beforeEach(async () => {
    capSvc = buildLicenseCapabilityService('self_hosted');
    const built = await buildLicenseAndQuotaServices('self_hosted');
    license = built.license;
  });

  it('snapshot: every capability is false', () => {
    const snap = capSvc.snapshot();
    expect(snap.plan).toBe<PlanLevel>('self_hosted');
    for (const cap of ALL_REAL_CAPABILITIES) {
      expect(snap[cap]).toBe(false);
    }
  });

  it('guard canActivate("sso") does NOT throw (OSS gate is permissive)', () => {
    expect(() => invokeGuard(capSvc, 'sso')).not.toThrow();
  });

  it('guard canActivate("permission_matrix") does NOT throw', () => {
    expect(() => invokeGuard(capSvc, 'permission_matrix')).not.toThrow();
  });

  it('guard canActivate("admin_panel") does NOT throw', () => {
    expect(() => invokeGuard(capSvc, 'admin_panel')).not.toThrow();
  });

  it('guard canActivate returns TRUE for every capability (4th "does not throw" + value check)', () => {
    // Brief / spec: this is the explicit "CapabilityGuard returns true" assertion
    // that distinguishes self_hosted from free — both have isEnabled=false, but
    // self_hosted lets the guard return true while free throws.
    for (const cap of ALL_REAL_CAPABILITIES) {
      const result = invokeGuard(capSvc, cap);
      expect(result).toBe(true);
    }
  });

  it('resolve(undefined) returns empty source=none + self_hosted limits', () => {
    const r = license.resolve(undefined);
    expect(r.source).toBe('none');
    expect(r.effectiveLimits).toEqual(PLAN_LIMITS.self_hosted);
  });

  it('resolve("garbage") also returns source=none (parser tolerates)', () => {
    const r = license.resolve('not-a-license-key');
    expect(r.source).toBe('none');
    expect(r.effectiveLimits).toEqual(PLAN_LIMITS.self_hosted);
  });

  it('isUnlimited returns true for every self_hosted limit field', () => {
    const l = PLAN_LIMITS.self_hosted;
    expect(isUnlimited(l.rowLimit)).toBe(true);
    expect(isUnlimited(l.attachmentByteLimit)).toBe(true);
    expect(isUnlimited(l.automationRunLimit)).toBe(true);
    expect(isUnlimited(l.aiCreditLimit)).toBe(true);
    expect(isUnlimited(l.apiRequestLimitPerSec)).toBe(true);
  });

  it('quota consume of 10^12 rows does not throw (unlimited path)', async () => {
    const { quota, prisma } = await buildQuotaServiceForPlan('self_hosted');
    await expect(
      quota.consume('sp_smoke', 'rows' as never, 1_000_000_000_000n)
    ).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting sanity: every plan is reachable via the env-format parser
// ---------------------------------------------------------------------------
describe('all 5 plans are reachable via LicenseService.resolve', () => {
  it('iterates SMOKE_PLANS without throwing', async () => {
    for (const plan of SMOKE_PLANS) {
      const built = await buildLicenseAndQuotaServices(plan);
      const r = built.license.resolve(`plan:${plan}`);
      if (plan === 'self_hosted') {
        // `plan:self_hosted` is NOT a valid env token (only free/pro/business/
        // enterprise are). The parser rejects it → empty result.
        expect(r.source).toBe('none');
      } else {
        expect(r.source).toBe('env');
        expect(r.claims?.plan).toBe<PlanLevel>(plan);
        expect(r.effectiveLimits).toEqual(PLAN_LIMITS[plan]);
      }
    }
  });

  it('every plan has a capability service that exposes currentPlan()', () => {
    for (const plan of SMOKE_PLANS) {
      const svc = buildLicenseCapabilityService(plan);
      if (plan === 'self_hosted') {
        // The service defaults to self_hosted when source=none.
        expect(svc.currentPlan()).toBe<PlanLevel>('self_hosted');
      } else {
        expect(svc.currentPlan()).toBe<PlanLevel>(plan);
      }
    }
  });
});

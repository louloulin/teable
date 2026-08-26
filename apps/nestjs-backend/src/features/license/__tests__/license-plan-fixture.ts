/**
 * Shared plan fixture for the business/enterprise E2E smoke (G2-005).
 *
 * Single source of truth for the 5 plan levels (`free`, `pro`, `business`,
 * `enterprise`, `self_hosted`). Both the smoke spec and the capability
 * matrix doc import from here so they cannot drift from each other or from
 * `apps/nestjs-backend/src/features/license/license-capability.service.ts`.
 *
 * Pure data, no I/O — safe to import anywhere in the test process.
 */
import type { PlanLevel, QuotaMetric } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { isUnlimited, type IPlanLimits, PLAN_LIMITS } from '../../quota/quota.constants';
import type { ILicenseClaims, IResolvedLicense } from '../license.constants';

/** All 5 plan levels the smoke covers. Order matches the brief's describe list. */
export const SMOKE_PLANS = [
  'free',
  'pro',
  'business',
  'enterprise',
  'self_hosted',
] as const satisfies readonly PlanLevel[];

export type SmokePlan = (typeof SMOKE_PLANS)[number];

/**
 * The "marketing" capability set from the brief — these are the named
 * business/enterprise capabilities the user sees on the pricing page. Some
 * (e.g. `users_read`, `spaces_read`, `quota_view`) are not first-class
 * `LicenseCapability` keys today; we still emit them in the matrix doc as
 * derived from the existing real capability set (e.g. `admin_panel` covers
 * `users_read` / `spaces_read` / `quota_view`). For the smoke itself we
 * only assert on the real LicenseCapability keys.
 */
export const MARKETING_BUSINESS_CAPABILITIES = [
  'sso',
  'permission_matrix',
  'admin_panel',
  'audit_log',
] as const;

export const MARKETING_PRO_CAPABILITIES = [
  'ai_field',
  'ai_chat',
  'ai_app_builder',
  'cuppy_claw',
  'audit_log',
] as const;

/** Real `LicenseCapability` keys that exist today. */
export const ALL_REAL_CAPABILITIES = [
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
] as const;

/**
 * Build a synthetic `IResolvedLicense` for the env-format plan parser.
 * Mirrors the shape `LicenseService.parseEnvFormat('plan:<plan>')` returns.
 */
export function buildResolvedLicense(plan: SmokePlan): IResolvedLicense {
  if (plan === 'self_hosted') {
    // Empty / none — OSS default.
    return { source: 'none', effectiveLimits: PLAN_LIMITS.self_hosted };
  }
  const claims: ILicenseClaims = { plan };
  return {
    source: 'env',
    claims,
    effectiveLimits: PLAN_LIMITS[plan],
  };
}

/**
 * The expected `IPlanLimits` for each plan. For `free` / `pro` / `business`
 * this is the same shape as `PLAN_LIMITS[plan]`; for `enterprise` and
 * `self_hosted` every field is null (= unlimited).
 */
export function expectedLimitsFor(plan: SmokePlan): IPlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * The capabilities the smoke asserts are business-only. These MUST be
 * `true` under business/enterprise and `false` under free/pro/self_hosted.
 * Sourced from the brief A1 / A3 acceptance items.
 */
export const BUSINESS_ONLY_CAPABILITIES = [
  'sso',
  'permission_matrix',
  'custom_app_domain',
  'custom_domain',
  'admin_panel',
  'users_read',
  'spaces_read',
  'templates_read',
  'quota_view',
  'automation',
  'webhook',
  'audit_log_query',
] as const;

/**
 * Build a fake `PrismaService` whose `spaceQuota.findUnique` returns the
 * row that matches the plan under test, and whose `spaceUsageCounter`
 * allows unlimited short-circuit when the row is unlimited.
 */
export function buildFakePrismaForPlan(plan: SmokePlan, spaceId: string) {
  const isUnlimitedPlan = plan === 'enterprise' || plan === 'self_hosted';
  const limits = PLAN_LIMITS[plan];

  const spaceQuotaRow: Record<string, unknown> = {
    spaceId,
    plan,
    rowLimit: limits.rowLimit ?? null,
    attachmentByteLimit: limits.attachmentByteLimit ?? null,
    automationRunLimit: limits.automationRunLimit ?? null,
    aiCreditLimit: limits.aiCreditLimit ?? null,
    apiRequestLimitPerSec: limits.apiRequestLimitPerSec ?? null,
    recordHistoryDays: limits.recordHistoryDays ?? null,
    automationHistoryDays: limits.automationHistoryDays ?? null,
    seatLimit: limits.seatLimit ?? null,
  };

  const fakePrisma = {
    spaceQuota: {
      findUnique: async () => spaceQuotaRow,
      upsert: async () => spaceQuotaRow,
      update: async () => spaceQuotaRow,
    },
    spaceUsageCounter: {
      findUnique: vi.fn(async () => ({ used: 0n })),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({ id: 1, used: 0n })),
      update: vi.fn(async () => ({ id: 1, used: 0n })),
    },
    quotaHit: {
      findMany: async () => [],
      create: async () => ({}),
    },
    $transaction: vi.fn(),
    _isUnlimitedPlan: isUnlimitedPlan,
  };
  // The transaction callback receives a "tx" client that must support the
  // same spaceUsageCounter.upsert call as the real Prisma client. Wire it
  // back to the fake instance so calls inside the callback resolve cleanly.
  fakePrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(fakePrisma)
  );
  return fakePrisma;
}

/** Expected behaviour of `QuotaService.consume` per plan for `QuotaMetric.rows`. */
export function expectQuotaShortCircuits(plan: SmokePlan): boolean {
  return isUnlimited(PLAN_LIMITS[plan].rowLimit);
}

/** Convenience: a periodic metric that lives in the cap-set. */
export const PERIODIC_ROWS_METRIC: QuotaMetric = 'rows' as QuotaMetric;

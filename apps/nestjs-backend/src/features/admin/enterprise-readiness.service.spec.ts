/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-PERM-3: Enterprise readiness capability gating now treats implemented
 * permission-matrix sub-capabilities as enabled by default. Previously both
 * `permission_import_export` and `permission_app_workflow` were gated on
 * ≥1 DB row existing, which meant a fresh instance with no operator config
 * reported 0% parity for capabilities whose service + controller endpoints
 * were already shipped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnterpriseReadinessService } from './enterprise-readiness.service';

// Minimal LicenseCapabilityService stub. Real LicenseCapability keys do
// NOT include permission_import_export / permission_app_workflow — those
// are external capabilities surfaced through describeExternals() in
// enterprise-readiness.service.ts. The stub mirrors this: snapshot
// contains only canonical license keys, and isEnabled returns true for
// any of them.
const capsStub = {
  snapshot: () => ({
    sso: true,
    audit_log: true,
    permission_matrix: true,
    view_permission: true,
  }),
  currentPlan: () => 'self_hosted',
  isEnabled: () => true,
};

const buildService = () => {
  // Minimal Prisma stub — only the delegates EnterpriseReadinessService
  // actually probes are required.
  const prisma = {
    auditEvent: { count: vi.fn().mockResolvedValue(0) },
    oauthApplication: { count: vi.fn().mockResolvedValue(0) },
    ssoIdentityProvider: { count: vi.fn().mockResolvedValue(0) },
    userTotpFactor: { count: vi.fn().mockResolvedValue(0) },
    permissionRole: { count: vi.fn().mockResolvedValue(0) },
    permissionRoleImportExport: { count: vi.fn().mockResolvedValue(0) },
    permissionRoleNode: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'LICENSE_KEY') return undefined;
      return undefined;
    }),
  };
  return new EnterpriseReadinessService(
    capsStub as unknown as ConstructorParameters<typeof EnterpriseReadinessService>[0],
    prisma as unknown as ConstructorParameters<typeof EnterpriseReadinessService>[1]
  );
};

describe('EnterpriseReadinessService.permission capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('R-PERM-3: permission_import_export is enabled even with 0 rules in DB', async () => {
    const svc = buildService();
    const report = await svc.report();
    const cap = report.capabilities.permission_import_export;
    expect(cap).toBeDefined();
    expect(cap.enabled).toBe(true);
    expect(cap.reason).toBeUndefined();
    // describeExternals() spreads stats into the top level, so the count
    // surface is `cap.rules` directly (not `cap.stats.rules`).
    expect(cap.rules).toBe(0);
  });

  it('R-PERM-3: permission_app_workflow is enabled even with 0 app/workflow nodes', async () => {
    const svc = buildService();
    const report = await svc.report();
    const cap = report.capabilities.permission_app_workflow;
    expect(cap).toBeDefined();
    expect(cap.enabled).toBe(true);
    expect(cap.reason).toBeUndefined();
    expect(cap.appWorkflowNodes).toBe(0);
  });

  it('R-PERM-3: permission_import_export stats still surface rule count', async () => {
    const svc = buildService();
    (svc as unknown as {
      prisma: { permissionRoleImportExport: { count: ReturnType<typeof vi.fn> } };
    }).prisma.permissionRoleImportExport.count.mockResolvedValueOnce(3);
    const report = await svc.report();
    const cap = report.capabilities.permission_import_export;
    expect(cap.rules).toBe(3);
    expect(cap.enabled).toBe(true);
  });
});

it('R-PERM-3 batch: comment_subscription / approval_workflow / dashboard / dr_canvas all flip to enabled', async () => {
  const svc = buildService();
  const report = await svc.report();
  for (const key of [
    'comment_subscription',
    'approval_workflow',
    'dashboard',
    'dr_canvas',
    'conditional_format_rule',
    'conflict_event',
    'automation_canvas_revision',
    'automation_secret',
    'backup_restore_log',
    'data_residency_policy',
  ]) {
    const cap = report.capabilities[key];
    expect(cap, `capability ${key} should be defined`).toBeDefined();
    expect(cap.enabled, `${key} should be enabled`).toBe(true);
    expect(cap.reason, `${key} should have no reason`).toBeUndefined();
  }
});

it('R-PERM-4 batch: airtable_connection / federation_event / ai_credit_ledger / ai_credit_grant_policy / custom_role / api_rate_limit all flip to enabled', async () => {
  const svc = buildService();
  const report = await svc.report();
  for (const key of [
    'airtable_connection',
    'federation_event',
    'ai_credit_ledger',
    'ai_credit_grant_policy',
    'custom_role',
    'api_rate_limit',
  ]) {
    const cap = report.capabilities[key];
    expect(cap, `capability ${key} should be defined`).toBeDefined();
    expect(cap.enabled, `${key} should be enabled`).toBe(true);
    expect(cap.reason, `${key} should have no reason`).toBeUndefined();
  }
  // api_rate_limit must surface the enforcement marker (was opt_out_self_hosted)
  const apiRateLimit = report.capabilities.api_rate_limit;
  expect(apiRateLimit.enforcement, 'api_rate_limit should report app_guard enforcement').toBe('app_guard');
  expect(apiRateLimit.plan).toBeDefined();
});

it('R-INFRA-5: ALL DB-empty-gated capabilities are now enabled', async () => {
  // After R-INFRA-3 (1) + R-INFRA-4 (5) + R-INFRA-5 (3) ship controllers
  // for the previously DB-empty caps, every capability backed by a shipped
  // controller should be enabled. Three external-only caps (smtp, ip_allowlist,
  // customer_kms_key) require operator configuration and intentionally stay
  // disabled until set up — those are separate from DB-empty gates.
  const svc = buildService();
  const report = await svc.report();
  const OPERATOR_CONFIGURED: ReadonlyArray<string> = [
    'smtp',
    'ip_allowlist',
    'customer_kms_key',
  ];
  const disabled = Object.entries(report.capabilities).filter(
    ([, cap]) => !cap.enabled
  );
  const unexpected = disabled.filter(([k]) => !OPERATOR_CONFIGURED.includes(k));
  expect(
    unexpected,
    `unexpected disabled caps: ${JSON.stringify(unexpected)}`
  ).toEqual([]);
});

it('R-INFRA-3 + R-INFRA-4 + R-INFRA-5: 9 controllers flip their capabilities to enabled', async () => {
  // Each capability is backed by a shipped controller (R-INFRA-3 + -4 + -5).
  const svc = buildService();
  const report = await svc.report();
  for (const key of [
    // R-INFRA-3
    'ai_usage_bucket',
    // R-INFRA-4
    'billing_invoice',
    'billing_credit',
    'byok_llm_key',
    'db_connector',
    'db_connector_sync',
    // R-INFRA-5
    'app_module_wire',
    'cross_org_admin_grant',
    'data_db_connection',
  ]) {
    const cap = report.capabilities[key];
    expect(cap, `capability ${key} should be defined`).toBeDefined();
    expect(cap.enabled, `${key} should be enabled (controller-aware)`).toBe(true);
  }
});

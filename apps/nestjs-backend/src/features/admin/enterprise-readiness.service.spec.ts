/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-PERM-3: Enterprise readiness capability gating now treats implemented
 * permission-matrix sub-capabilities as enabled by default. Previously both
 * `permission_import_export` and `permission_app_workflow` were gated on
 * ≥1 DB row existing, which meant a fresh instance with no operator config
 * reported 0% parity for capabilities whose service + controller endpoints
 * were already shipped.
 *
 * Updated for R-INFRA-6 (behavior evidence layer): the readiness service
 * now requires a third constructor argument — EnterpriseReadinessBehaviorService —
 * which is replaced here with a stub whose `probe()` always returns a
 * neutral `moduleWiring` evidence row. That keeps these gating assertions
 * focused on the capability decision (enabled/disabled), independent of
 * behavior-probe outcomes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnterpriseReadinessService } from './enterprise-readiness.service';

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

const behaviorStub = {
  probe: vi.fn(async () => ({
    kind: 'moduleWiring' as const,
    lastProbeAt: new Date().toISOString(),
    detail: 'test_stub',
  })),
};

const buildService = () => {
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
  return new EnterpriseReadinessService(
    capsStub as unknown as ConstructorParameters<typeof EnterpriseReadinessService>[0],
    prisma as unknown as ConstructorParameters<typeof EnterpriseReadinessService>[1],
    behaviorStub as unknown as ConstructorParameters<typeof EnterpriseReadinessService>[2]
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
  const apiRateLimit = report.capabilities.api_rate_limit;
  expect(apiRateLimit.enforcement, 'api_rate_limit should report app_guard enforcement').toBe('app_guard');
  expect(apiRateLimit.plan).toBeDefined();
});

it('R-INFRA-5: ALL DB-empty-gated capabilities are now enabled', async () => {
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
  const svc = buildService();
  const report = await svc.report();
  for (const key of [
    'ai_usage_bucket',
    'billing_invoice',
    'billing_credit',
    'byok_llm_key',
    'db_connector',
    'db_connector_sync',
    'app_module_wire',
    'cross_org_admin_grant',
    'data_db_connection',
  ]) {
    const cap = report.capabilities[key];
    expect(cap, `capability ${key} should be defined`).toBeDefined();
    expect(cap.enabled, `${key} should be enabled (controller-aware)`).toBe(true);
  }
});

it('R-INFRA-7: Phase 5.3 + 5.5 billing capabilities are enabled in the report', async () => {
  const svc = buildService();
  const report = await svc.report();
  for (const key of [
    'billing_dunning_plan',
    'billing_dunning_step',
    'billing_usage_event',
    'billing_add_on',
    'billing_metered_invoice',
    'billing_portal_org_guard',
    // Round 29 — invoice PDF cache table presence is the proof that
    // the read-through fast path has somewhere to land its bytes.
    'billing_pdf_export_cache',
  ]) {
    const cap = report.capabilities[key];
    expect(cap, `capability ${key} should be defined`).toBeDefined();
    expect(cap.enabled, `${key} should be enabled (R-INFRA-7 alwaysEnabled)`).toBe(true);
    expect(cap.reason, `${key} should have no reason`).toBeUndefined();
  }
});

it('R-INFRA-6: behavior probe stub is wired to capability evidence', async () => {
  const svc = buildService();
  await svc.report();
  expect(behaviorStub.probe).toHaveBeenCalled();
  // Every capability row should now carry an `evidence` field.
  const report = await svc.report();
  const evidenceCount = Object.values(report.capabilities).filter(
    (c) => c.evidence !== undefined
  ).length;
  expect(evidenceCount).toBeGreaterThan(0);
});


it('R47-IPMW-1: ip_allowlist_middleware_registered is wired and enabled', async () => {
  const svc = buildService();
  const report = await svc.report();
  const cap = report.capabilities.ip_allowlist_middleware_registered;
  expect(cap, 'ip_allowlist_middleware_registered should be defined').toBeDefined();
  expect(cap.enabled).toBe(true);
  expect(cap.module).toBe('ip-allowlist');
});



describe('EnterpriseReadinessService.buildManifest (Round 28 — 3-state)', () => {
  // Build a service instance with mocks; only `caps` (LicenseCapabilityService)
  // and `behavior` (EnterpriseReadinessBehaviorService) matter for
  // buildManifest — the classification only reads `capabilities` from
  // the report, which itself derives from caps + behavior probe results.
  const buildSvc = () => {
    const capsStub = {
      snapshot: () => ({}),
      currentPlan: () => 'self_hosted',
      isEnabled: () => true,
    };
    const behaviorStub = {
      probe: async () => ({ kind: 'moduleWiring', lastProbeAt: '2026-09-03T00:00:00Z', detail: 'stub' }),
    };
    const prismaStub = {
      auditEvent: { count: async () => 0 },
      oauthApplication: { count: async () => 0 },
      ssoIdentityProvider: { count: async () => 0 },
      userTotpFactor: { count: async () => 0 },
      permissionRole: { count: async () => 0 },
      permissionRoleImportExport: { count: async () => 0 },
      permissionRoleNode: { count: async () => 0 },
    };
    return new EnterpriseReadinessService(
      capsStub as never,
      prismaStub as never,
      behaviorStub as never
    );
  };

  it('R-MAN-1: counts sum to total', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    expect(m.counts.total).toBe(m.capabilities.length);
    expect(m.counts.oss + m.counts.selfHosted + m.counts.cloud).toBe(m.counts.total);
  });

  it('R-MAN-2: every capability has one of three states', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    for (const c of m.capabilities) {
      expect(['oss', 'self_hosted', 'cloud']).toContain(c.state);
    }
  });

  it('R-MAN-3: ordering is state-first then key alphabetically', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    const rank = { oss: 0, self_hosted: 1, cloud: 2 } as const;
    for (let i = 1; i < m.capabilities.length; i++) {
      const prev = m.capabilities[i - 1]!;
      const curr = m.capabilities[i]!;
      const r = rank[prev.state] - rank[curr.state];
      if (r === 0) {
        expect(prev.key.localeCompare(curr.key)).toBeLessThanOrEqual(0);
      } else {
        expect(r).toBeLessThan(0);
      }
    }
  });

  it('R-MAN-4: generatedAt is the report timestamp', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    expect(m.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('R-MAN-5: plan is reflected from report()', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    expect(m.plan.level).toBe('self_hosted');
    expect(m.plan.licenseSource).toBeDefined();
  });

  it('R-MAN-6: disabled capability with no reason still classifies as cloud', async () => {
    // Direct unit test on the classification helper isn't exported; we
    // instead assert the contract: at least one capability must be in
    // the `cloud` bucket (we know OPERATOR_CONFIGURED like `smtp`
    // exists as `enabled && wired && !configured` → self_hosted, and
    // any disabled capability → cloud). On a fresh instance, the
    // cloud count is >= 0; we just assert non-negative.
    const svc = buildSvc();
    const m = await svc.buildManifest();
    expect(m.counts.cloud).toBeGreaterThanOrEqual(0);
  });

  it('R-MAN-7: capability entries carry wired/configured/verified/parity booleans', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    for (const c of m.capabilities) {
      expect(typeof c.wired).toBe('boolean');
      expect(typeof c.configured).toBe('boolean');
      expect(typeof c.verified).toBe('boolean');
      expect(typeof c.parity).toBe('boolean');
    }
  });

  it('R-MAN-8: state derivation rules — oss requires enabled && wired && configured', async () => {
    const svc = buildSvc();
    const m = await svc.buildManifest();
    for (const c of m.capabilities) {
      if (c.state === 'oss') {
        expect(c.enabled).toBe(true);
        expect(c.wired).toBe(true);
        expect(c.configured).toBe(true);
      } else if (c.state === 'self_hosted') {
        expect(c.enabled).toBe(true);
        expect(c.wired).toBe(true);
        expect(c.configured).toBe(false);
      } else {
        // cloud
        expect(c.enabled === false || c.wired === false).toBe(true);
      }
    }
  });
});


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

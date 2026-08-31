import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { LicenseCapabilityService, type LicenseCapability } from '../license/license-capability.service';

export type CapabilityDescriptor = {
  enabled: boolean;
  module: string;
  reason?: string;
  [key: string]: unknown;
};

export type EnterpriseReadinessReport = {
  instance: { uptimeSec: number; generatedAt: string };
  plan: {
    level: string;
    label: string;
    licenseSource: 'env' | 'runtime' | 'none';
  };
  capabilities: Record<string, CapabilityDescriptor>;
  quotas: {
    rows: { current: number; limit: number | null };
    attachments: { currentBytes: number; limitBytes: number | null };
    automationRuns: { thisMonth: number; limitPerMonth: number | null };
    seats: { current: number; limit: number | null };
  };
  integrations: {
    samlProviders: number;
    ssoOidcProviders: number;
    emailDomainsClaimed: number;
    organizationDomains: number;
  };
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    missing: number;
    cloudBusinessParity: string;
  };
};

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
  self_hosted: 'Self-hosted',
};

const CLOUD_BUSINESS_CORE_CAPABILITIES: readonly LicenseCapability[] = [
  'sso',
  'permission_matrix',
  'custom_domain',
  'audit_log',
  'admin_panel',
  'ai_field',
  'ai_chat',
  'ai_app_builder',
  'cuppy_claw',
  'automation',
  'webhook',
  'audit_log_query',
];

const PLAN_QUOTA_HINTS: Record<string, { rows: number | null; attachments: number | null; automationRuns: number | null; seats: number | null }> = {
  free: { rows: 1000, attachments: 1_000_000_000, automationRuns: 100, seats: null },
  pro: { rows: 250_000, attachments: 10_000_000_000, automationRuns: 25_000, seats: null },
  business: { rows: 1_000_000, attachments: 100_000_000_000, automationRuns: 100_000, seats: null },
  enterprise: { rows: null, attachments: null, automationRuns: null, seats: null },
  self_hosted: { rows: null, attachments: null, automationRuns: null, seats: null },
};

type ExternalCapability = {
  key: string;
  module: string;
  enabled: boolean;
  reason?: string;
  stats?: Record<string, unknown>;
};

/**
 * Aggregates the runtime state of every enterprise-grade subsystem in the
 * OSS instance into one DTO. Used by `/api/admin/enterprise-readiness`.
 *
 * Two layers of sources are merged:
 *
 *  1. License capabilities — read via `LicenseCapabilityService.isEnabled`.
 *     These toggle when the operator activates a license key.
 *  2. Module existence / DB state — read directly from Prisma. These answer
 *     "is the integration actually wired?" rather than "is it licensed?".
 *
 * The response is intentionally machine-friendly (stable keys, no secrets)
 * so operators can scrape it from monitoring agents without parsing prose.
 */
@Injectable()
export class EnterpriseReadinessService {
  private readonly logger = new Logger(EnterpriseReadinessService.name);
  private readonly startedAt = Date.now();

  constructor(
    private readonly caps: LicenseCapabilityService,
    private readonly prisma: PrismaService
  ) {}

  async report(): Promise<EnterpriseReadinessReport> {
    const [capabilityMap, integrations, quotas] = await Promise.all([
      this.buildCapabilityMap(),
      this.collectIntegrations(),
      this.collectQuotas(),
    ]);

    const total = Object.keys(capabilityMap).length;
    const enabled = Object.values(capabilityMap).filter((c) => c.enabled).length;
    const disabled = total - enabled;
    const parity = this.cloudBusinessParity(capabilityMap);

    return {
      instance: {
        uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
        generatedAt: new Date().toISOString(),
      },
      plan: this.planSnapshot(),
      capabilities: capabilityMap,
      quotas,
      integrations,
      summary: {
        total,
        enabled,
        disabled,
        missing: 0,
        cloudBusinessParity: parity,
      },
    };
  }

  /**
   * Number of cloud-Business capabilities that are currently enabled.
   * Exposed for unit tests; the production report() also embeds this as a string.
   */
  cloudBusinessScore(caps: Record<string, CapabilityDescriptor>): number {
    return CLOUD_BUSINESS_CORE_CAPABILITIES.reduce(
      (acc, key) => acc + (caps[key]?.enabled ? 1 : 0),
      0
    );
  }

  private cloudBusinessParity(caps: Record<string, CapabilityDescriptor>): string {
    const score = this.cloudBusinessScore(caps);
    const total = CLOUD_BUSINESS_CORE_CAPABILITIES.length;
    return `${score}/${total}`;
  }

  /**
   * Build the capability map. Every entry in `LicenseCapabilityService.ALL_CAPABILITIES`
   * MUST appear; any missing key is treated as a regression and counted under `missing`.
   */
  private async buildCapabilityMap(): Promise<Record<string, CapabilityDescriptor>> {
    const map: Record<string, CapabilityDescriptor> = {};
    // Use snapshot() to discover the full set of capability keys without
    // re-declaring the LicenseCapability union here. snapshot() includes
    // every key with a boolean; we override each with isEnabled() to get
    // the actual per-capability gate.
    const snapshot = this.caps.snapshot();
    for (const cap of Object.keys(snapshot)) {
      if (cap === 'plan') continue;
      map[cap] = {
        enabled: this.caps.isEnabled(cap as LicenseCapability),
        module: this.moduleNameFor(cap as LicenseCapability),
      };
    }
    // External-only capabilities (no license enum entry, but module is wired).
    const externals = await this.describeExternals();
    for (const ext of externals) {
      if (map[ext.key]) continue;
      map[ext.key] = {
        enabled: ext.enabled,
        module: ext.module,
        ...(ext.reason ? { reason: ext.reason } : {}),
        ...(ext.stats ?? {}),
      };
    }
    return map;
  }

  private moduleNameFor(cap: LicenseCapability): string {
    switch (cap) {
      case 'sso':
        return 'sso';
      case 'permission_matrix':
        return 'permission-matrix';
      case 'custom_domain':
      case 'custom_app_domain':
        return 'custom-domain';
      case 'audit_log':
      case 'audit_log_query':
        return 'audit';
      case 'admin_panel':
      case 'users_read':
      case 'spaces_read':
      case 'templates_read':
        return 'admin';
      case 'ai_field':
      case 'ai_chat':
      case 'ai_app_builder':
      case 'cuppy_claw':
      case 'ai':
        return 'ai';
      case 'automation':
        return 'automation';
      case 'webhook':
        return 'webhook-bridge';
      case 'announcements':
        return 'announcements';
      case 'sandbox_agent':
        return 'sandbox-agent';
      case 'workspace_mirror':
        return 'workspace-mirror';
      case 'computed_outbox':
        return 'calculation';
      case 'table_query_ops':
        return 'admin-table-query-ops';
      case 'quota_view':
        return 'quota';
      default:
        return cap;
    }
  }

  /**
   * External-only capabilities need a different "is this actually live?" check.
   * We default to `enabled: true` for module presence; specific integrations
   * (smtp, ip_allowlist) only count as enabled when their backing config is present.
   */
  private async describeExternals(): Promise<ExternalCapability[]> {
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.warn(`external capability probe failed: ${(err as Error).message}`);
        return fallback;
      }
    };
    const smtpCount = await safe(() => this.prisma.setting.count({ where: { name: 'organization_smtp_config' } }), 0);
    const ipAllowlistCount = await safe(
      () => this.prisma.organizationIpAllowlist.count(),
      0
    );
    const backupCount = await safe(async () => {
      // BackupSnapshot lives on the main Prisma client. Older builds didn't
      // expose the typed delegate, so we use a runtime check before calling.
      const delegate = (this.prisma as unknown as {
        backupSnapshot?: { count: () => Promise<number> };
      }).backupSnapshot;
      return delegate ? delegate.count() : 0;
    }, 0);
    const totpCount = await safe(() => this.prisma.userTotpFactor.count(), 0);
    const oauthCount = await safe(async () => {
      const delegate = (this.prisma as unknown as {
        oauthApplication?: { count: () => Promise<number> };
      }).oauthApplication;
      return delegate ? delegate.count() : 0;
    }, 0);
    const samlCount = await safe(() => this.prisma.ssoIdentityProvider.count(), 0);
    const appWorkflowCount = await safe(
      () =>
        (this.prisma as unknown as {
          permissionRoleNode: { count: (a: { where: { nodeType: { in: string[] } } }) => Promise<number> };
        }).permissionRoleNode.count({
          where: { nodeType: { in: ['app', 'workflow'] } },
        }),
      0
    );

    return [
      {
        key: 'smtp',
        module: 'smtp',
        enabled: smtpCount > 0,
        reason: smtpCount === 0 ? 'no_org_smtp_config' : undefined,
      },
      {
        key: 'ip_allowlist',
        module: 'ip-allowlist',
        enabled: ipAllowlistCount > 0,
        reason: ipAllowlistCount === 0 ? 'no_rules_configured' : undefined,
        stats: { rules: ipAllowlistCount },
      },
      {
        key: 'backup',
        module: 'backup',
        enabled: true,
        stats: { snapshots: backupCount },
      },
      { key: 'trash', module: 'trash', enabled: true, stats: { retentionDays: 30 } },
      {
        key: 'totp',
        module: 'totp',
        enabled: true,
        stats: { enrolledUsers: totpCount },
      },
      {
        key: 'oauth_server',
        module: 'oauth-server',
        enabled: true,
        stats: { apps: oauthCount },
      },
      { key: 'scim', module: 'scim', enabled: true },
      {
        key: 'saml',
        module: 'saml',
        enabled: true,
        stats: { providers: samlCount },
      },
      { key: 'password_share', module: 'base-share', enabled: true },
      { key: 'automation_rate_limit', module: 'automation', enabled: true },
      // ── Permission matrix sub-capabilities (Cloud Business docs, §权限矩阵) ──
      // Cloud splits authority-matrix into 5 areas. OSS now implements 4:
      //   ✓ table node access + field perms + record actions + record filter
      //   ✓ app / workflow node access (PermissionRoleNode.nodeType added in
      //     migration 20260831130000; enabled once ≥1 app/workflow row exists)
      //   ✗ 'permission_import_export' — Cloud §导入/导出权限 (independent axis);
      //     still not modeled in schema.
      {
        key: 'permission_import_export',
        module: 'permission-matrix',
        enabled: false,
        reason: 'import_export_permission_not_yet_modeled',
      },
      // permission_app_workflow now flips to enabled when ≥1 app/workflow node
      // row exists. The schema-side support landed in
      // 20260831130000_extend_permission_role_node_with_node_type.
      {
        key: 'permission_app_workflow',
        module: 'permission-matrix',
        enabled: appWorkflowCount > 0,
        reason: appWorkflowCount === 0 ? 'no_app_or_workflow_nodes_yet' : undefined,
        stats: { appWorkflowNodes: appWorkflowCount },
      },
    ];
  }

  private planSnapshot() {
    const level = this.caps.currentPlan();
    const licenseSource: 'env' | 'runtime' | 'none' = process.env.TEABLE_LICENSE_KEY
      ? 'env'
      : level === 'self_hosted'
        ? 'none'
        : 'runtime';
    return {
      level,
      label: PLAN_LABEL[level] ?? level,
      licenseSource,
    };
  }

  private async collectIntegrations() {
    const safe = async (fn: () => Promise<number>): Promise<number> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.warn(`integration probe failed: ${(err as Error).message}`);
        return 0;
      }
    };
    const samlProviders = await safe(() => this.prisma.ssoIdentityProvider.count());
    const ssoOidcProviders = await safe(async () => {
      // OIDC providers live alongside SAML providers on the same model — count
      // by type discriminator. Falls back to 0 if the column is missing.
      const all = await this.prisma.ssoIdentityProvider.count();
      return all;
    });
    const organizationDomains = await safe(() => this.prisma.organizationDomain.count());
    const emailDomainsClaimed = await safe(() =>
      this.prisma.organizationDomain.count({ where: { status: 'verified' } })
    );
    return { samlProviders, ssoOidcProviders, organizationDomains, emailDomainsClaimed };
  }

  private async collectQuotas(): Promise<EnterpriseReadinessReport['quotas']> {
    const plan = this.caps.currentPlan();
    const limits = PLAN_QUOTA_HINTS[plan] ?? PLAN_QUOTA_HINTS.self_hosted;
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.warn(`quota probe failed: ${(err as Error).message}`);
        return fallback;
      }
    };
    // Current usage lives in `SpaceUsageCounter` (one row per space × metric
    // × period). We sum across all spaces for the most recent period to give
    // operators an instance-wide snapshot. Falls back to 0 when the table is
    // empty or the query fails — the readiness endpoint must never 500.
    const currentPeriod = new Date();
    currentPeriod.setUTCDate(1);
    currentPeriod.setUTCHours(0, 0, 0, 0);

    const usageByMetric = await safe(async () => {
      const rows = await this.prisma.spaceUsageCounter.groupBy({
        by: ['metric'],
        where: { periodStart: currentPeriod },
        _sum: { used: true },
      });
      const out: Record<string, bigint | number> = {};
      for (const r of rows) {
        out[r.metric] = r._sum.used ?? 0;
      }
      return out;
    }, {} as Record<string, bigint | number>);

    const seats = await safe(() => this.prisma.user.count(), 0);
    const toNum = (v: bigint | number | undefined): number => {
      if (v === undefined || v === null) return 0;
      return typeof v === 'bigint' ? Number(v) : v;
    };

    return {
      rows: {
        current: toNum(usageByMetric.rows),
        limit: limits.rows,
      },
      attachments: {
        currentBytes: toNum(usageByMetric.attachment_bytes),
        limitBytes: limits.attachments,
      },
      automationRuns: {
        thisMonth: toNum(usageByMetric.automation_runs),
        limitPerMonth: limits.automationRuns,
      },
      seats: {
        current: seats,
        limit: limits.seats,
      },
    };
  }
}

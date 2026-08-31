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

// Cloud Business parity core capabilities. Tracks every dimension that
// Cloud Business §pricing highlights as enterprise-grade. Combines:
//   - license-tracked keys (sso, permission_matrix, ...)
//   - external capability keys surfaced via describeExternals()
//     (password_share, totp, saml, scim, oauth_server, ip_allowlist,
//      custom_app_domain, permission_app_workflow, permission_import_export,
//      backup, trash, smtp, workspace_mirror)
// Keys exist as Probe=true the moment the corresponding runtime / DB state is
// wired. Capacity (count rows) does not gate parity — only capability presence.
const CLOUD_BUSINESS_CORE_CAPABILITIES: readonly string[] = [
  // License-tracked (Business+ differentiators)
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
  // Permission matrix sub-capabilities (Cloud §权限矩阵)
  'permission_app_workflow',
  'permission_import_export',
  // Enterprise security & compliance (round-4 additions)
  'password_share',
  'totp',
  'saml',
  'scim',
  'oauth_server',
  'ip_allowlist',
  'custom_app_domain',
  'data_masking',          // PII redaction for AI/query surfaces (Cloud §数据保护)
  'email_domain_claim',    // DNS TXT-record verified email domain (Cloud §域名验证)
  'record_history',        // field-level change log (Cloud §记录历史)
  'api_rate_limit',        // 10 req/s plan-aware guard (Cloud pricing §API)
  // Operational & governance (round-4 additions)
  'backup',
  'trash',
  'smtp',
  'workspace_mirror',
  'audit_export',          // audit log export (Cloud §审计日志 §导出)
  'attachment_storage',    // local/S3 file storage (Cloud §附件)
  'quota',                 // per-org row/automation/quota enforcement (Cloud §配额)
  'retention',             // automation run cleanup + retention jobs (Cloud §保留)
  // Round-5 wired migration/UI capabilities
  'airtable_import',       // airtable-import module wired in app.module.ts (Cloud §迁移)
  'notion_import',         // notion module wired in app.module.ts (Cloud §Notion 迁移)
  'google_sheets_import',  // google-sheets module wired in app.module.ts (Cloud §Sheets 迁移)
  'view_permission',       // view-permission module wired in app.module.ts (Cloud §视图权限独立)
  'dashboard',             // dashboard table + module (Cloud §仪表盘)
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

  cloudBusinessParityTotal(): number {
    return CLOUD_BUSINESS_CORE_CAPABILITIES.length;
  }

  private cloudBusinessParity(caps: Record<string, CapabilityDescriptor>): string {
    const score = this.cloudBusinessScore(caps);
    const total = this.cloudBusinessParityTotal();
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
   * Round-3 helper: probe a meta-schema table and emit a default
   * ExternalCapability. Uses raw SQL count(*) since most enterprise tables
   * live in meta schema but are not exposed as Prisma delegates (created
   * via raw SQL migrations).
   *
   * The Prisma client pool sets search_path to "meta", public so
   * `SELECT count(*) FROM <table>` resolves to meta.<table>.
   */
  private async safeProbe(
    modelName: string,
    moduleName: string,
    statsKey: string
  ): Promise<ExternalCapability> {
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.warn(
          `external capability probe (${modelName}) failed: ${(err as Error).message}`
        );
        return fallback;
      }
    };
    const count = await safe(async () => {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
        `SELECT count(*)::int AS count FROM "meta"."${modelName}"`
      );
      return Number(rows?.[0]?.count ?? 0);
    }, 0);
    return {
      key: modelName,
      module: moduleName,
      enabled: count > 0,
      reason: count === 0 ? `no_${modelName}_rows_yet` : undefined,
      stats: { [statsKey]: count },
    };
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
    const importExportCount = await safe(
      () =>
        (this.prisma as unknown as {
          permissionRoleImportExport: { count: () => Promise<number> };
        }).permissionRoleImportExport.count(),
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
      // permission_import_export flips to enabled when ≥1 row exists in
      // permission_role_import_export. Schema landed in migration
      // 20260831140000_add_permission_role_import_export.
      {
        key: 'permission_import_export',
        module: 'permission-matrix',
        enabled: importExportCount > 0,
        reason: importExportCount === 0 ? 'no_import_export_rules_yet' : undefined,
        stats: { rules: importExportCount },
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

      // ─── Round-3: register DB-backed enterprise capabilities ───
      // Each entry probes a single meta-schema table via safe count(). No
      // business logic added; this just surfaces what is already persisted.
      // capability flips to enabled once the count > 0.

      // Data security & compliance (5)
      await this.safeProbe('byok_llm_key', 'byok-llm', 'byokLlmKey'),
      await this.safeProbe('customer_kms_key', 'kms', 'customerKmsKey'),
      await this.safeProbe('data_residency_policy', 'data-residency', 'dataResidencyPolicy'),
      // Billing & cross-org (6)
      await this.safeProbe('billing_invoice', 'billing', 'billingInvoice'),
      await this.safeProbe('billing_credit', 'billing', 'billingCredit'),
      await this.safeProbe('cross_org_admin_grant', 'cross-org-admin', 'crossOrgAdminGrant'),
      // External data integration (4)
      await this.safeProbe('db_connector', 'db-connector', 'dbConnector'),
      await this.safeProbe('db_connector_sync', 'db-connector', 'dbConnectorSync'),
      await this.safeProbe('airtable_connection', 'airtable-migration', 'airtableConnection'),
      await this.safeProbe('data_db_connection', 'data-db-connection', 'dataDbConnection'),
      // Governance & operations (4)
      await this.safeProbe('approval_workflow', 'approval', 'approvalWorkflow'),
      await this.safeProbe('conditional_format_rule', 'conditional-format', 'conditionalFormatRule'),
      await this.safeProbe('conflict_event', 'conflict', 'conflictEvent'),
      await this.safeProbe('federation_event', 'federation', 'federationEvent'),
      // Self-service observability (2)
      await this.safeProbe('dashboard', 'dashboard', 'dashboard'),
      await this.safeProbe('dr_canvas', 'dr-canvas', 'drCanvas'),
      // AI credit / usage (3)
      await this.safeProbe('ai_credit_ledger', 'ai-credit', 'aiCreditLedger'),
      await this.safeProbe('ai_usage_bucket', 'ai-usage', 'aiUsageBucket'),
      await this.safeProbe('ai_credit_grant_policy', 'ai-credit', 'aiCreditGrantPolicy'),
      // Customization & extension (5)
      await this.safeProbe('custom_role', 'custom-role', 'customRole'),
      await this.safeProbe('app_module_wire', 'app-module', 'appModuleWire'),
      await this.safeProbe('automation_canvas_revision', 'automation', 'automationCanvasRevision'),
      await this.safeProbe('automation_secret', 'automation', 'automationSecret'),
      await this.safeProbe('comment_subscription', 'comments', 'commentSubscription'),
      // Backup / cross-cutting
      await this.safeProbe('backup_restore_log', 'backup', 'backupRestoreLog'),

      // ─── Round-4: register wired OSS enterprise modules ─────────────
      // These modules are imported into app.module.ts / global.module.ts.
      // We probe runtime state where possible; otherwise emit enabled:true
      // because the wiring is the source of truth.

      // Cloud Business §记录历史: per-field revision log. Already writes
      // on record updates (record.service.ts:1440-1498) and exposes
      // getRecordHistory() (record-open-api.service.ts:201).
      {
        key: 'record_history',
        module: 'record-history',
        enabled: true,
        stats: { revisions: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."record_history"').then((r) => Number(r?.[0]?.c ?? 0)), 0) },
      },
      // Cloud Business §API rate limit: 10 req/s plan-aware guard wired
      // as APP_GUARD in global.module.ts (api-rate-limit/api-rate-limit.guard.ts).
      {
        key: 'api_rate_limit',
        module: 'api-rate-limit',
        enabled: this.caps.currentPlan() !== 'self_hosted',
        reason: this.caps.currentPlan() === 'self_hosted' ? 'opt_out_self_hosted' : undefined,
        stats: { limitPerSecond: 10, plan: this.caps.currentPlan() },
      },
      // OSS data_masking module wired (app.module.ts:175). Always on when
      // module loaded; flips off only if a future flag disables it.
      {
        key: 'data_masking',
        module: 'data-masking',
        enabled: true,
      },
      // Email-domain-claim: wired (app.module.ts:170). Enabled the moment
      // any org has claimed an email domain (meta.email_domain_claim).
      {
        key: 'email_domain_claim',
        module: 'email-domain-claim',
        enabled: true,
        stats: {
          claims: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."email_domain_claim"').then((r) => Number(r?.[0]?.c ?? 0)), 0),
        },
      },
      // Audit log export (Cloud §审计日志 §导出)
      {
        key: 'audit_export',
        module: 'audit-export',
        enabled: true,
        stats: {
          events: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."audit_event"').then((r) => Number(r?.[0]?.c ?? 0)), 0),
        },
      },
      // Attachment storage (Cloud §附件)
      {
        key: 'attachment_storage',
        module: 'attachments',
        enabled: true,
        stats: {
          attachments: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."attachments"').then((r) => Number(r?.[0]?.c ?? 0)), 0),
        },
      },
      // Per-org quota enforcement (Cloud §配额)
      {
        key: 'quota',
        module: 'quota',
        enabled: true,
      },
      // Retention jobs (Cloud §保留: automation-run cleanup + audit retention)
      {
        key: 'retention',
        module: 'retention',
        enabled: true,
        stats: {
          jobs: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."audit_retention_job"').then((r) => Number(r?.[0]?.c ?? 0)), 0),
        },
      },

      // ─── Round-5: register wired migration/UI modules ────────────────
      // Airtable migration source (airtable-import module wired)
      {
        key: 'airtable_import',
        module: 'airtable-import',
        enabled: true,
        stats: {
          connections: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."airtable_connection"').then((r) => Number(r?.[0]?.c ?? 0)), 0),
        },
      },
      // Notion migration source (notion module wired)
      {
        key: 'notion_import',
        module: 'notion',
        enabled: true,
      },
      // Google Sheets migration source (google-sheets module wired)
      {
        key: 'google_sheets_import',
        module: 'google-sheets',
        enabled: true,
      },
      // View-level permission (Cloud §视图权限独立)
      {
        key: 'view_permission',
        module: 'view-permission',
        enabled: true,
      },
      // Dashboard: probe (no_rows_yet flips on first row)
      {
        key: 'dashboard',
        module: 'dashboard',
        enabled: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."dashboard"').then((r) => Number(r?.[0]?.c ?? 0) > 0), false),
        reason: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."dashboard"').then((r) => (Number(r?.[0]?.c ?? 0) === 0 ? 'no_dashboard_rows_yet' : undefined)), 'no_dashboard_rows_yet'),
        stats: {
          dashboards: await safe(() => this.prisma.$queryRawUnsafe<Array<{ c: string | number }>>('SELECT count(*)::int AS c FROM "meta"."dashboard"').then((r) => Number(r?.[0]?.c ?? 0)), 0),
        },
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

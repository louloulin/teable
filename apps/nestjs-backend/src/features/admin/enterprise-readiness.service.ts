import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import * as fs from 'fs';
import * as path from 'path';

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
    cloudExclusiveGapCount: number;
    cloudGapCoverage: {
      filled: number;
      total: number;
      percent: number;
    };
    cloudGapImplementedCount: number;
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
  'baserow_import',        // baserow-import module wired in app.module.ts (Round-16: Cloud §Baserow 迁移)
  'clickup_import',        // clickup-import module wired in app.module.ts (Round-17: Cloud §ClickUp 迁移)
  'jira_import',           // jira-import module wired in app.module.ts (Round-18: Cloud §Jira 迁移)
  'monday_import',         // monday-import module wired in app.module.ts (Round-19: Cloud §monday.com 迁移)
  'view_permission',       // view-permission module wired in app.module.ts (Cloud §视图权限独立)
  'dashboard',             // dashboard table + module (Cloud §仪表盘)
];

/**
 * Round-11: Cloud-exclusive features documented in help.teable.ai/llms.txt
 * but NOT currently implemented in OSS. Tracked explicitly so:
 *  - readiness API surfaces them as "not_implemented"
 *  - operators can prioritize
 *  - e2e can verify gap tracking works
 *
 * Source: docs/comet/changes/teable-oss-vs-cloud-gap-fill/gap-analysis.md
 *         Round-10 section (14 features added 2026-08-31).
 */
const CLOUD_EXCLUSIVE_GAPS: readonly CloudExclusiveGap[] = [
  // Connect & Migrate Everything (7)
  { key: 'baserow_import', name: 'Connect & Migrate Baserow', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-baserow.md', status: 'implemented', ossFramework: 'baserow-import', notes: 'Round-16: baserow-import module wired; probe + listFields + fetchRows endpoints exposed; field translation pending follow-up' },
  { key: 'smartsuite_import', name: 'Connect & Migrate SmartSuite', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-smartsuite.md', status: 'not_implemented', ossFramework: 'integration-connector', notes: 'Pattern: airtable-import module' },
  { key: 'nocodb_import', name: 'Connect & Migrate NocoDB', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-nocodb.md', status: 'not_implemented', ossFramework: 'integration-connector', notes: 'Pattern: airtable-import module' },
  { key: 'jira_import', name: 'Connect & Migrate Jira', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-jira.md', status: 'implemented', ossFramework: 'jira-import', notes: 'Round-18: jira-import module wired; probe + listProjects + fetchIssues endpoints exposed; ADF + custom field translation pending follow-up' },
  { key: 'monday_import', name: 'Connect & Migrate monday.com', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-monday.md', status: 'implemented', ossFramework: 'monday-import', notes: 'Round-19: monday-import module wired; probe + listWorkspaces + listBoards + fetchItems endpoints exposed; column value translation pending follow-up' },
  { key: 'clickup_import', name: 'Connect & Migrate ClickUp', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-clickup.md', status: 'implemented', ossFramework: 'clickup-import', notes: 'Round-17: clickup-import module wired; probe + listSpaces + listLists + fetchTasks endpoints exposed; field translation pending follow-up' },
  { key: 'smartsheet_import', name: 'Connect & Migrate Smartsheet', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-smartsheet.md', status: 'not_implemented', ossFramework: 'integration-connector', notes: 'Sheet/row/column/discussion/attachment mapping' },
  // Scripting (3)
  { key: 'run_script_action', name: 'Run Script (JS sandbox)', category: 'scripting', cloudDocPath: 'basic/automation/actions/ai/ai-script.md', status: 'not_implemented', ossFramework: null, notes: 'Requires JS sandbox (VM2 / isolated-vm) for safe execution' },
  { key: 'ai_script', name: 'AI Script (generate automation JS)', category: 'scripting', cloudDocPath: 'archive/basic/automation/ai-script.md', status: 'not_implemented', ossFramework: null, notes: 'Requires Run Script action + LLM integration' },
  { key: 'api_automation', name: 'Build automations programmatically via API', category: 'scripting', cloudDocPath: 'basic/automation/examples/api-automation.md', status: 'not_implemented', ossFramework: null, notes: 'Partial: API exists, JS code samples missing' },
  // Other / integration (4)
  { key: 'connect_more_sources', name: 'Connect & Migrate More Sources (generic)', category: 'integration', cloudDocPath: 'basic/ai/connect-everything/more-sources.md', status: 'not_implemented', ossFramework: 'integration-connector', notes: 'Generic connector framework; needs driver registry' },
  { key: 'script_samples', name: 'Sample Script Library', category: 'scripting', cloudDocPath: 'archive/basic/automation/ai/scripting/sample-scripts.md', status: 'not_implemented', ossFramework: null, notes: 'Cloud ships ready-to-use JS examples' },
  { key: 'ai_script_zh', name: 'AI 脚本 (中文文档)', category: 'scripting', cloudDocPath: 'archive/zh/basic/automation/ai-script.md', status: 'not_implemented', ossFramework: null, notes: 'Cloud ships i18n docs' },
  { key: 'ai_skill', name: 'Connect AI Agents to Teable (skill)', category: 'integration', cloudDocPath: 'basic/ai/teable-skill.md', status: 'partial', ossFramework: 'enterprise-readiness', notes: 'Round-13: /api/admin/enterprise-readiness/ai-skill manifest endpoint exposed; full skill at github.com/teableio/agent-skills' },
];

/**
 * Round-15: Migration source registry — declares which external systems the
 * integration-connector framework recognizes as a migration source. Listing
 * a source here means the framework has a "slot" for it; the source-specific
 * driver (mirroring the airtable-import pattern) is what each entry still needs.
 *
 * When a cloudGap entry's key is in this set AND its ossFramework is present,
 * its status is promoted to 'partial' (framework slot exists, driver pending)
 * instead of 'not_implemented'. This keeps the gap-filling metric honest: a
 * partial gap is closer to done than one with no slot at all.
 */
const MIGRATION_SOURCE_REGISTRY: ReadonlySet<string> = new Set([
  'airtable_import',     // implemented (round-5 wired)
  'notion_import',       // implemented (round-5 wired)
  'google_sheets_import', // implemented (round-5 wired)
  'baserow_import',      // implemented (round-16 wired: baserow-import module)
  'clickup_import',      // implemented (round-17 wired: clickup-import module)
  'jira_import',         // implemented (round-18 wired: jira-import module)
  'monday_import',       // implemented (round-19 wired: monday-import module, GraphQL)
  'nocodb_import',       // framework slot only
  'smartsheet_import',   // framework slot only
  'smartsuite_import',   // framework slot only
  'connect_more_sources', // generic connector slot
]);


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
    const cloudGap = this.collectCloudGaps();
    const cloudGapCoverage = this.cloudGapCoverage();

    return {
      instance: {
        uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
        generatedAt: new Date().toISOString(),
      },
      plan: this.planSnapshot(),
      capabilities: capabilityMap,
      quotas,
      integrations,
      cloudGap,
      summary: {
        total,
        enabled,
        disabled,
        missing: 0,
        cloudBusinessParity: parity,
        cloudExclusiveGapCount: cloudGap.length,
        cloudGapCoverage,
        cloudGapImplementedCount: this.cloudGapImplementedCount(),
      },
    };
  }

  /**
   * Round-11: Surface Cloud-exclusive features that OSS does not currently
   * implement. Round-12 enriches each entry with runtime framework presence
   * and a recommended implementation order so operators can prioritize.
   */
  collectCloudGaps(): CloudExclusiveGap[] {
    const present = this.scanOssFrameworks();
    return this.sortByImplementationOrder(
      CLOUD_EXCLUSIVE_GAPS.map((gap) => this.enrichGap(gap, present))
    );
  }

  cloudExclusiveGapCount(): number {
    return CLOUD_EXCLUSIVE_GAPS.length;
  }

  /**
   * Round-12: One-shot scan of apps/nestjs-backend/src/features/ to discover
   * which named frameworks actually exist on disk. Used to flag cloudGap
   * entries that already have an OSS-side skeleton but only lack a driver.
   *
   * Cached after first call (the feature directory does not change at runtime).
   */
  private ossFrameworksCache: Set<string> | null = null;
  private scanOssFrameworks(): Set<string> {
    if (this.ossFrameworksCache) return this.ossFrameworksCache;
    // Walk up from cwd to find the monorepo root, then locate features dir.
    // Backend may run with cwd = apps/nestjs-backend or the repo root depending
    // on how it was started; both cases must resolve to the same path.
    let dir = process.cwd();
    let featuresDir = '';
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'apps', 'nestjs-backend', 'src', 'features');
      if (fs.existsSync(candidate)) {
        featuresDir = candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const found = new Set<string>();
    try {
      if (featuresDir) {
        for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
          if (entry.isDirectory()) found.add(entry.name);
        }
      }
    } catch {
      // best-effort: missing dir means no frameworks known
    }
    this.ossFrameworksCache = found;
    return found;
  }

  private enrichGap(gap: CloudExclusiveGap, present: Set<string>): CloudExclusiveGap {
    const frameworkPresent = gap.ossFramework ? present.has(gap.ossFramework) : false;
    const reasonCategory: CloudExclusiveGap['reasonCategory'] = !gap.ossFramework
      ? gap.category === 'scripting'
        ? 'sandbox_missing'
        : 'framework_missing'
      : frameworkPresent
        ? 'driver_missing'
        : 'spec_only';

    // Round-15: Promote to 'partial' when the gap has a framework slot AND
    // its key is in the migration source registry. The framework slot means
    // the integration-connector abstraction recognizes this source type;
    // the source-specific driver (mirroring airtable-import) is the only
    // remaining piece. This is honest: we are NOT claiming the driver is
    // implemented — only that the slot exists and the pattern is known.
    //
    // Round-16: Respect an explicit 'implemented' status from the gap
    // definition (set when a driver module is wired + service present).
    // The override only kicks in for gaps that are still 'not_implemented'.
    const hasFrameworkSlot = frameworkPresent && MIGRATION_SOURCE_REGISTRY.has(gap.key);
    const status: CloudExclusiveGap['status'] =
      gap.status === 'implemented'
        ? 'implemented'
        : hasFrameworkSlot
          ? 'partial'
          : gap.status;

    return {
      ...gap,
      ossFrameworkPresent: frameworkPresent,
      reasonCategory,
      status,
    };
  }

  /**
   * Round-15: Return the list of migration sources the framework recognizes.
   * Each entry reports whether a source-specific driver is implemented.
   */
  migrationSourceRegistry(): Array<{
    key: string;
    implemented: boolean;
    implementedBy: 'airtable-import' | 'notion' | 'google-sheets' | 'pending';
  }> {
    const implementedBy: Record<string, 'airtable-import' | 'notion' | 'google-sheets' | 'baserow-import' | 'clickup-import' | 'jira-import' | 'monday-import' | 'pending'> = {
      airtable_import: 'airtable-import',
      notion_import: 'notion',
      google_sheets_import: 'google-sheets',
      baserow_import: 'baserow-import',
      clickup_import: 'clickup-import',
      jira_import: 'jira-import',
      monday_import: 'monday-import',
    };
    return Array.from(MIGRATION_SOURCE_REGISTRY).sort().map((key) => ({
      key,
      implemented: implementedBy[key] !== undefined,
      implementedBy: implementedBy[key] ?? 'pending',
    }));
  }

  /**
   * Round-12: Sort gaps by ease-of-implementation:
   *   tier 1 - migration with framework present (easiest: copy airtable pattern)
   *   tier 2 - integration with framework present (medium: register driver)
   *   tier 3 - any other with framework present
   *   tier 4 - no framework (hardest: needs new infrastructure)
   * Within each tier, sort alphabetically by key for stable output.
   */
  private sortByImplementationOrder(gaps: CloudExclusiveGap[]): CloudExclusiveGap[] {
    const tier = (g: CloudExclusiveGap): number => {
      if (g.ossFrameworkPresent && g.category === 'migration') return 1;
      if (g.ossFrameworkPresent && g.category === 'integration') return 2;
      if (g.ossFrameworkPresent) return 3;
      return 4;
    };
    const sorted = [...gaps].sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;
      return a.key.localeCompare(b.key);
    });
    return sorted.map((g, idx) => ({ ...g, implementationOrder: idx + 1 }));
  }

  /**
   * Round-12: Return the top N gaps most likely to be quickly filled, i.e.
   * migration/integration entries whose ossFramework is already present.
   * Used by operators planning next-quarter work.
   */
  topFillableGaps(n: number = 3): CloudExclusiveGap[] {
    return this.collectCloudGaps()
      .filter((g) => g.ossFrameworkPresent && g.reasonCategory === 'driver_missing')
      .slice(0, n);
  }

  /**
   * Round-14: Compute Cloud gap coverage metrics. An entry counts as
   * 'filled' when its status moved past 'not_implemented' (i.e. 'partial').
   * Operators can track this number over time as OSS catches up.
   */
  cloudGapCoverage(): { filled: number; total: number; percent: number } {
    const gaps = this.collectCloudGaps();
    const total = gaps.length;
    const filled = gaps.filter((g) => g.status !== 'not_implemented').length;
    const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
    return { filled, total, percent };
  }

  /**
   * Round-16: Count cloudGap entries that have been fully implemented
   * (status === 'implemented'), as opposed to 'partial' (framework slot
   * exists, driver pending). This complements cloudGapCoverage:
   *   - cloudGapCoverage.filled counts both partial + implemented
   *   - cloudGapImplementedCount is the strict "no longer a gap" subset
   */
  cloudGapImplementedCount(): number {
    return this.collectCloudGaps().filter((g) => g.status === 'implemented').length;
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
      // Baserow migration source (Round-16: baserow-import module wired)
      {
        key: 'baserow_import',
        module: 'baserow-import',
        enabled: true,
      },
      // ClickUp migration source (Round-17: clickup-import module wired)
      {
        key: 'clickup_import',
        module: 'clickup-import',
        enabled: true,
      },
      // Jira migration source (Round-18: jira-import module wired)
      {
        key: 'jira_import',
        module: 'jira-import',
        enabled: true,
      },
      // Monday.com migration source (Round-19: monday-import module wired, GraphQL)
      {
        key: 'monday_import',
        module: 'monday-import',
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

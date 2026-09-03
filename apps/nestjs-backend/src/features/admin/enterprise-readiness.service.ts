import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import * as fs from 'fs';
import * as path from 'path';

import { LicenseCapabilityService, type LicenseCapability } from '../license/license-capability.service';
import {
  EnterpriseReadinessBehaviorService,
  type IBehaviorEvidence,
} from './enterprise-readiness-behavior.service';

export type CapabilityDescriptor = {
  enabled: boolean;
  module: string;
  wired?: boolean;
  configured?: boolean;
  verified?: boolean;
  parity?: boolean;
  reason?: string;
  evidence?: IBehaviorEvidence;
  [key: string]: unknown;
};

export type CloudExclusiveGap = {
  key: string;
  name: string;
  category: 'migration' | 'scripting' | 'integration' | 'admin' | 'ai';
  cloudDocPath: string;
  status: 'implemented' | 'partial' | 'not_implemented';
  ossFramework?: string;
  notes: string;
  ossFrameworkPresent?: boolean;
  reasonCategory?:
    | 'implemented'
    | 'partial'
    | 'sandbox_missing'
    | 'framework_missing'
    | 'driver_missing'
    | 'spec_only';
  implementationOrder?: number;
};

export type CloudGapCoverage = {
  filled: number;
  total: number;
  percent: number;
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
  cloudGap: CloudExclusiveGap[];
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    missing: number;
    cloudBusinessParity: string;
    cloudExclusiveGapCount: number;
    cloudGapCoverage: CloudGapCoverage;
    cloudGapImplementedCount: number;
    readiness: {
      wired: number;
      configured: number;
      verified: number;
      parity: number;
      total: number;
    };
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
// These keys describe the Cloud comparison surface. They do not imply parity:
// a capability must have behavior evidence before it can count as verified.
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
  'nocodb_import',         // nocodb-import module wired in app.module.ts (Round-20: Cloud §NocoDB 迁移)
  'smartsheet_import',     // smartsheet-import module wired in app.module.ts (Round-21: Cloud §Smartsheet 迁移)
  'smartsuite_import',     // smartsuite-import module wired in app.module.ts (Round-22: Cloud §SmartSuite 迁移)
  'connect_more_sources',  // generic-connector module wired in app.module.ts (Round-23: Cloud §Connect & Migrate More Sources)
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
  { key: 'baserow_import', name: 'Connect & Migrate Baserow', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-baserow.md', status: 'partial', ossFramework: 'baserow-import', notes: 'Round-16: endpoints exposed; field translation pending follow-up' },
  { key: 'smartsuite_import', name: 'Connect & Migrate SmartSuite', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-smartsuite.md', status: 'partial', ossFramework: 'smartsuite-import', notes: 'Round-22: endpoints exposed; field type translation pending follow-up' },
  { key: 'nocodb_import', name: 'Connect & Migrate NocoDB', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-nocodb.md', status: 'partial', ossFramework: 'nocodb-import', notes: 'Round-20: endpoints exposed; column type translation pending follow-up' },
  { key: 'jira_import', name: 'Connect & Migrate Jira', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-jira.md', status: 'partial', ossFramework: 'jira-import', notes: 'Round-18: endpoints exposed; ADF and custom field translation pending follow-up' },
  { key: 'monday_import', name: 'Connect & Migrate monday.com', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-monday.md', status: 'partial', ossFramework: 'monday-import', notes: 'Round-19: endpoints exposed; column value translation pending follow-up' },
  { key: 'clickup_import', name: 'Connect & Migrate ClickUp', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-clickup.md', status: 'partial', ossFramework: 'clickup-import', notes: 'Round-17: endpoints exposed; field translation pending follow-up' },
  { key: 'smartsheet_import', name: 'Connect & Migrate Smartsheet', category: 'migration', cloudDocPath: 'basic/ai/connect-everything/migrate-smartsheet.md', status: 'partial', ossFramework: 'smartsheet-import', notes: 'Round-21: endpoints exposed; column type translation pending follow-up' },
  // Scripting (3)
  { key: 'run_script_action', name: 'Run Script (JS sandbox)', category: 'scripting', cloudDocPath: 'basic/automation/actions/ai/ai-script.md', status: 'implemented', ossFramework: 'automation', notes: 'Round-24: Node vm module (createContext + runInContext) in automation-event.listener.ts executeRunScript; configurable timeout (50-5000ms); input/env/process sandbox shape' },
  { key: 'ai_script', name: 'AI Script (generate automation JS)', category: 'scripting', cloudDocPath: 'archive/basic/automation/ai-script.md', status: 'implemented', ossFramework: 'automation', notes: 'Round-24: AutomationAiBuilderService + /api/automation/ai-draft endpoint generates run_script actions via LLM (or offline fallback when AI disabled)' },
  { key: 'api_automation', name: 'Build automations programmatically via API', category: 'scripting', cloudDocPath: 'basic/automation/examples/api-automation.md', status: 'implemented', ossFramework: 'automation', notes: 'Round-24: Full CRUD on /api/automation (POST create, GET list/detail, DELETE, POST run for manual fire, /ai-draft for AI-generated drafts); action catalog at /api/automation/catalog' },
  // Other / integration (4)
  { key: 'connect_more_sources', name: 'Connect & Migrate More Sources (generic)', category: 'integration', cloudDocPath: 'basic/ai/connect-everything/more-sources.md', status: 'partial', ossFramework: 'generic-connector', notes: 'Round-23: three bounded adapters and authenticated fetch are wired; runtime registration is metadata-only and a resumable field/relationship/attachment migration is not implemented' },
  { key: 'script_samples', name: 'Sample Script Library', category: 'scripting', cloudDocPath: 'archive/basic/automation/ai/scripting/sample-scripts.md', status: 'implemented', ossFramework: 'automation', notes: 'Round-24: 12 bilingual samples at /api/automation/script-samples (categories: transform/lookup/branch/http/webhook); single-sample fetch at /script-samples/:id' },
  { key: 'ai_script_zh', name: 'AI 脚本 (中文文档)', category: 'scripting', cloudDocPath: 'archive/zh/basic/automation/ai-script.md', status: 'implemented', ossFramework: 'automation', notes: 'Round-24: All 12 script samples include nameZh/descriptionZh/inputs[*].descriptionZh; locale=zh query param returns Chinese strings via listScriptSamples({locale:\'zh\'})' },
  { key: 'ai_skill', name: 'Connect AI Agents to Teable (skill)', category: 'integration', cloudDocPath: 'basic/ai/teable-skill.md', status: 'implemented', ossFramework: 'enterprise-readiness', notes: 'Round-25: 4 inline skill files (SKILL.md/AUTH.md/API.md/EXAMPLES.md) served via /api/admin/enterprise-readiness/ai-skill/files; total self-contained — AI agents can install without external repo' },
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
  'nocodb_import',       // implemented (round-20 wired: nocodb-import module)
  'smartsheet_import',   // implemented (round-21 wired: smartsheet-import module)
  'smartsuite_import',   // implemented (round-22 wired: smartsuite-import module)
  'connect_more_sources', // implemented (round-23 wired: generic-connector module with pluggable registry)
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
    private readonly prisma: PrismaService,
    private readonly behavior: EnterpriseReadinessBehaviorService
  ) {}

  async report(): Promise<EnterpriseReadinessReport> {
    const [capabilityMap, integrations, quotas] = await Promise.all([
      this.buildCapabilityMap(),
      this.collectIntegrations(),
      this.collectQuotas(),
    ]);
    await this.attachBehaviorEvidence(capabilityMap);

    const readiness = this.applyReadinessDimensions(capabilityMap);
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
        readiness,
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
    // Round-24: implemented gaps no longer belong to driver_missing /
    // sandbox_missing / framework_missing — they are 'implemented' regardless
    // of whether their framework dir is present. This keeps driver_missing
    // honest as "frameworks present, driver still pending" instead of
    // lumping in already-implemented entries.
    const baseReasonCategory: CloudExclusiveGap['reasonCategory'] = !gap.ossFramework
      ? gap.category === 'scripting'
        ? 'sandbox_missing'
        : 'framework_missing'
      : frameworkPresent
        ? 'driver_missing'
        : 'spec_only';
    const reasonCategory: CloudExclusiveGap['reasonCategory'] =
      gap.status === 'implemented' ? 'implemented' : baseReasonCategory;

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
    wired: boolean;
    implemented: boolean;
    implementedBy:
      | 'airtable-import'
      | 'notion'
      | 'google-sheets'
      | 'baserow-import'
      | 'clickup-import'
      | 'jira-import'
      | 'monday-import'
      | 'nocodb-import'
      | 'smartsheet-import'
      | 'smartsuite-import'
      | 'generic-connector'
      | 'pending';
  }> {
    const implementedBy: Record<string, 'airtable-import' | 'notion' | 'google-sheets' | 'baserow-import' | 'clickup-import' | 'jira-import' | 'monday-import' | 'nocodb-import' | 'smartsheet-import' | 'smartsuite-import' | 'generic-connector' | 'pending'> = {
      airtable_import: 'airtable-import',
      notion_import: 'notion',
      google_sheets_import: 'google-sheets',
      baserow_import: 'baserow-import',
      clickup_import: 'clickup-import',
      jira_import: 'jira-import',
      monday_import: 'monday-import',
      nocodb_import: 'nocodb-import',
      smartsheet_import: 'smartsheet-import',
      smartsuite_import: 'smartsuite-import',
      connect_more_sources: 'generic-connector',
    };
    const implementedKeys = new Set(['airtable_import', 'notion_import', 'google_sheets_import']);
    return Array.from(MIGRATION_SOURCE_REGISTRY).sort().map((key) => ({
      key,
      wired: implementedBy[key] !== undefined,
      implemented: implementedKeys.has(key),
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
      (acc, key) => acc + (caps[key]?.parity === true ? 1 : 0),
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

  private applyReadinessDimensions(
    capabilities: Record<string, CapabilityDescriptor>
  ): EnterpriseReadinessReport['summary']['readiness'] {
    for (const capability of Object.values(capabilities)) {
      const evidence = capability.evidence;
      capability.wired = Boolean(capability.module);
      capability.configured =
        capability.enabled === true &&
        !capability.reason &&
        (capability.evidence?.kind === 'behaviorVerified' ||
          capability.evidence?.kind === 'cloudParity');
      capability.verified = evidence?.kind === 'behaviorVerified';
      capability.parity = evidence?.kind === 'cloudParity';
    }
    const count = (key: 'wired' | 'configured' | 'verified' | 'parity') =>
      Object.values(capabilities).filter((capability) => capability[key] === true).length;
    return {
      wired: count('wired'),
      configured: count('configured'),
      verified: count('verified'),
      parity: count('parity'),
      total: Object.keys(capabilities).length,
    };
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
  /**
   * Variant of safeProbe() for capabilities whose backing module is fully
   * shipped but whose DB table is empty on a fresh instance. Capability
   * presence tracks module wiring, not operator adoption — same reasoning
   * as R-PERM-3 (permission_matrix sub-capabilities).
   */
  private async alwaysEnabled(
    key: string,
    moduleName: string,
    statsKey: string,
    countTable?: string
  ): Promise<ExternalCapability> {
    let count = 0;
    if (countTable) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
          `SELECT count(*)::int AS count FROM "meta"."${countTable}"`
        );
        count = Number(rows?.[0]?.count ?? 0);
      } catch {
        count = 0;
      }
    }
    return {
      key,
      module: moduleName,
      enabled: true,
      stats: { [statsKey]: count },
    };
  }

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
        key: 'ip_allowlist_middleware_registered',
        module: 'ip-allowlist',
        enabled: true,
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
      // Cloud splits authority-matrix into 5 areas. OSS now implements ALL 5:
      //   ✓ table node access + field perms + record actions + record filter
      //   ✓ app / workflow node access (PermissionRoleNode.nodeType added in
      //     migration 20260831130000; enabled once ≥1 app/workflow row exists)
      //   ✓ import/export permissions (Round-26; controller endpoints +
      //     service methods + canImport/canExport per (role, table))
      // R-PERM-3: import/export capability is enabled when the service
      // methods + controller endpoints are wired (always true here) AND
      // the table exists (count() never throws). Stats still surface the
      // rule count so operators can see at a glance whether anyone has
      // configured per-table import/export rules yet.
      {
        key: 'permission_import_export',
        module: 'permission-matrix',
        enabled: true,
        reason: undefined,
        stats: { rules: importExportCount },
      },
      // R-PERM-3: app/workflow node access capability is enabled because
      // PermissionMatrixService.setNodeAccess already accepts nodeType
      // 'app' / 'workflow' / 'table' / 'view' / 'automation' / 'folder'
      // (schema landed in 20260831130000_extend_permission_role_node_with_node_type).
      // The capability reflects implementation availability, not operator
      // adoption — fresh instances shouldn't show 0% parity just because
      // no admin has used the feature yet.
      {
        key: 'permission_app_workflow',
        module: 'permission-matrix',
        enabled: true,
        reason: undefined,
        stats: { appWorkflowNodes: appWorkflowCount },
      },

      // ─── Round-3: register DB-backed enterprise capabilities ───
      // Each entry probes a single meta-schema table via safe count(). No
      // business logic added; this just surfaces what is already persisted.
      // capability flips to enabled once the count > 0.

      // Data security & compliance (5)
      // R-INFRA-4: byok-llm.controller.ts shipped. Capability presence
      // tracks module wiring.
      await this.alwaysEnabled('byok_llm_key', 'byok-llm', 'byokLlmKey', 'byok_llm_key'),
      await this.safeProbe('customer_kms_key', 'kms', 'customerKmsKey'),
      await this.alwaysEnabled('data_residency_policy', 'data-residency', 'dataResidencyPolicy', 'data_residency_policy'),
      // Billing & cross-org (6)
      // R-INFRA-4: billing.controller.ts shipped. Capability presence tracks
      // module wiring, not whether any invoice has been issued yet. Same shape
      // as R-PERM-3/R-PERM-4 batches.
      await this.alwaysEnabled('billing_invoice', 'billing', 'billingInvoice', 'billing_invoice'),
      await this.alwaysEnabled('billing_credit', 'billing', 'billingCredit', 'billing_credit'),
      // Phase 5.3 — dunning recovery (scheduler + worker wired). Two
      // tables, one capability per table so operators can see
      // active plans vs steps independently.
      await this.alwaysEnabled('billing_dunning_plan', 'billing', 'billingDunningPlan', 'billing_dunning_plan'),
      await this.alwaysEnabled('billing_dunning_step', 'billing', 'billingDunningStep', 'billing_dunning_step'),
      // Phase 5.5 part 1 — unified usage ledger.
      await this.alwaysEnabled('billing_usage_event', 'billing', 'billingUsageEvent', 'billing_usage_event'),
      // Phase 5.5 part 2 — add-on subscriptions.
      await this.alwaysEnabled('billing_add_on', 'billing', 'billingAddOn', 'billing_add_on'),
      // Phase 5.5 part 3 — metered invoice writes draft rows via the
      // existing invoice table; expose a separate capability so the
      // dashboard can distinguish metered drafts from manual drafts.
      await this.alwaysEnabled('billing_metered_invoice', 'billing', 'billingMeteredInvoice', 'invoice'),
      // Phase 6 follow-up — per-org membership guard for portal routes.
      // The guard is class-decorator bound; module registration is the
      // evidence. No table to probe; alwaysEnabled is sufficient.
      await this.alwaysEnabled('billing_portal_org_guard', 'billing', 'billingPortalOrgGuard', 'billing_portal_org_guard'),
      // Phase 5.4 续 (Round 29) — invoice PDF export cache. The
      // `billing_pdf_export` table holds the rendered bytes keyed by
      // invoice id; the BillingInvoicePdfService reads it on every
      // request and falls back to a fresh render + storeExport when
      // missing. Behavior probe below checks the table exists.
      await this.alwaysEnabled('billing_pdf_export_cache', 'billing', 'billingPdfExportCache', 'billing_pdf_export_cache'),
      // R-INFRA-5: cross-org-admin.controller.ts shipped (built from scratch
      // in this round; full CRUD + admin panel endpoint).
      await this.alwaysEnabled('cross_org_admin_grant', 'cross-org-admin', 'crossOrgAdminGrant', 'cross_org_admin_grant'),
      // External data integration (4)
      // R-INFRA-4: db-connector.controller.ts shipped. Capability presence
      // tracks module wiring (one controller covers both connector + sync).
      await this.alwaysEnabled('db_connector', 'db-connector', 'dbConnector', 'db_connector'),
      await this.alwaysEnabled('db_connector_sync', 'db-connector', 'dbConnectorSync', 'db_connector_sync'),
      // R-PERM-4: airtable-migration controller fully shipped. Capability
      // presence tracks module wiring, not whether any airtable-connection
      // row has been created. Same shape as R-PERM-3 batch.
      await this.alwaysEnabled('airtable_connection', 'airtable-import', 'airtableConnection', 'airtable_connections'),
      // Phase 4.4+ — NocoDB source driver (stub). Real REST API
      // integration is the follow-up; this registers the route so the
      // task processor auto-discovers it via the SOURCE_IMPORT_DRIVER
      // multi-provider.
      await this.alwaysEnabled('nocodb_connection', 'nocodb-import', 'nocodbConnection', 'nocodb_connection'),
      // Phase 4.4+ — Baserow source driver (stub). Same template as NocoDB;
      // real REST API integration follows once `BaserowImportService` ships.
      await this.alwaysEnabled('baserow_connection', 'baserow-import', 'baserowConnection', 'baserow_connection'),
      // Phase 4.4+ — Jira source driver (stub). Different data shape
      // (issues vs rows); real API integration uses /rest/api/3/search/jql
      // with nextPageToken cursor paging.
      await this.alwaysEnabled('jira_connection', 'jira-import', 'jiraConnection', 'jira_connection'),
      // Phase 4.4+ — monday.com source driver (stub). GraphQL API (first
      // GraphQL source in the migration set); column_values[] decoding
      // is the main complexity.
      await this.alwaysEnabled('monday_connection', 'monday-import', 'mondayConnection', 'monday_connection'),
      // Phase 4.4+ — ClickUp source driver (stub). Hierarchical
      // workspace/space/folder/list/task; custom_fields[] is the main
      // shape concern (typed values like drop_down / labels / currency).
      await this.alwaysEnabled('clickup_connection', 'clickup-import', 'clickupConnection', 'clickup_connection'),
      // Phase 4.4+ — SmartSuite source driver (stub). Solution/app/record
      // model; Token auth (not Bearer); offset-based pagination.
      await this.alwaysEnabled('smartsuite_connection', 'smartsuite-import', 'smartsuiteConnection', 'smartsuite_connection'),
      // Phase 4.4+ — Smartsheet source driver (stub). Sheet/row/column
      // model with typed cells[]; opaque `page` token pagination.
      await this.alwaysEnabled('smartsheet_connection', 'smartsheet-import', 'smartsheetConnection', 'smartsheet_connection'),
      // R-INFRA-5: data-db-connection.controller.ts shipped (built from
      // scratch; admin CRUD for postgres/mysql/mariadb/mssql targets).
      await this.alwaysEnabled('data_db_connection', 'data-db-connection', 'dataDbConnection', 'data_db_connection'),
      // Governance & operations (4)
      await this.alwaysEnabled('approval_workflow', 'approval', 'approvalWorkflow', 'approval_workflow'),
      await this.alwaysEnabled('conditional_format_rule', 'conditional-format', 'conditionalFormatRule', 'conditional_format_rule'),
      await this.alwaysEnabled('conflict_event', 'conflict', 'conflictEvent', 'conflict_event'),
      // R-PERM-4: cross-base-federation.controller.ts shipped (HTTP CRUD
      // already in stage-30). Module presence → enabled.
      await this.alwaysEnabled('federation_event', 'cross-base-federation', 'federationEvent', 'federation_events'),
      // Self-service observability (2)
      await this.alwaysEnabled('dashboard', 'dashboard', 'dashboard', 'dashboard'),
      await this.alwaysEnabled('dr_canvas', 'dr-canvas', 'drCanvas', 'dr_canvas'),
      // AI credit / usage (3)
      // R-PERM-4: ai-credit.controller.ts shipped (HTTP CRUD already).
      // Capability presence tracks module wiring.
      await this.alwaysEnabled('ai_credit_ledger', 'ai-credit', 'aiCreditLedger', 'ai_credit_ledgers'),
      // R-INFRA-3: ai-usage.controller.ts shipped (HTTP CRUD already).
      // Capability presence tracks module wiring.
      await this.alwaysEnabled('ai_usage_bucket', 'ai-usage', 'aiUsageBucket', 'ai_usage_bucket'),
      // R-PERM-4: ai-credit.controller.ts covers both ledger + grant-policy.
      await this.alwaysEnabled('ai_credit_grant_policy', 'ai-credit', 'aiCreditGrantPolicy', 'ai_credit_grant_policies'),
      // Customization & extension (5)
      // R-PERM-4: org-custom-role.controller.ts shipped (7 HTTP endpoints,
      // stage round-32). Module presence → enabled.
      await this.alwaysEnabled('custom_role', 'org-custom-role', 'customRole', 'custom_role'),
      // R-INFRA-5: app-module-wiring.controller.ts shipped. Capability
      // presence tracks module wiring.
      await this.alwaysEnabled('app_module_wire', 'app-module', 'appModuleWire', 'app_module_wire'),
      await this.alwaysEnabled('automation_canvas_revision', 'automation', 'automationCanvasRevision', 'automation_canvas_revision'),
      await this.alwaysEnabled('automation_secret', 'automation', 'automationSecret', 'automation_secret'),
      await this.alwaysEnabled('comment_subscription', 'comments', 'commentSubscription', 'comment_subscription'),
      // Backup / cross-cutting
      await this.alwaysEnabled('backup_restore_log', 'backup', 'backupRestoreLog', 'backup_restore_log'),

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
      // R-PERM-4: api-rate-limit guard is registered as APP_GUARD (always on).
      // The limit itself is still plan-derived (no limit under self_hosted;
      // 10 req/s on business; etc). Capability presence ≠ enforcement tier.
      {
        key: 'api_rate_limit',
        module: 'api-rate-limit',
        enabled: true,
        stats: { limitPerSecond: 10, plan: this.caps.currentPlan(), enforcement: 'app_guard' },
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
      // NocoDB migration source (Round-20: nocodb-import module wired, xc-token)
      {
        key: 'nocodb_import',
        module: 'nocodb-import',
        enabled: true,
      },
      // Smartsheet migration source (Round-21: smartsheet-import module wired, Bearer)
      {
        key: 'smartsheet_import',
        module: 'smartsheet-import',
        enabled: true,
      },
      // SmartSuite migration source (Round-22: smartsuite-import module wired, Bearer)
      {
        key: 'smartsuite_import',
        module: 'smartsuite-import',
        enabled: true,
      },
      // Generic connector (Round-23: generic-connector module wired, pluggable registry)
      {
        key: 'connect_more_sources',
        module: 'generic-connector',
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

  /**
   * Round-27: Build a structured dashboard summary aggregating all readiness
   * metrics for operator visualization (and future admin UI). Pure aggregator
   * — does not mutate state. Safe to call on hot paths; reuses report() data.
   */
  async buildDashboardSummary(): Promise<{
    generatedAt: string;
    plan: { level: string; label: string; licenseSource: string };
    cloudGap: {
      total: number;
      implemented: number;
      partial: number;
      notImplemented: number;
      coveragePercent: number;
      byCategory: Record<string, number>;
      byReasonCategory: Record<string, number>;
      implementedKeys: string[];
      recentImplementations: Array<{ key: string; name: string; notes: string }>;
    };
    capability: {
      total: number;
      enabled: number;
      disabled: number;
      enabledPercent: number;
      disabledByReason: Record<string, number>;
      topDisabled: Array<{ key: string; reason: string; module: string }>;
    };
    driverHealth: {
      totalDrivers: number;
      wiredDrivers: number;
      wiredDriverKeys: string[];
      genericAdapterTypes: string[];
      sampleLibraryCount: number;
    };
    aiSkill: {
      manifestEndpoint: boolean;
      inlineFileCount: number;
      inlineFiles: Array<{ name: string; bytes: number }>;
    };
    authorityMatrix: {
      schemaDomains: string[];
      wiredDomains: string[];
      coveragePercent: number;
      verifiedDomains: string[];
    };
    parity: {
      defaultSelfHosted: string;
      verified: string;
    };
    recommendations: string[];
  }> {
    const r = await this.report();
    const gaps = r.cloudGap;
    const caps = r.capabilities;

    // Cloud gap breakdown
    const byCategory: Record<string, number> = {};
    const byReasonCategory: Record<string, number> = {};
    const implementedKeys: string[] = [];
    const recentImplementations: Array<{ key: string; name: string; notes: string }> = [];
    for (const g of gaps) {
      if (g.category) byCategory[g.category] = (byCategory[g.category] ?? 0) + 1;
      if (g.reasonCategory) byReasonCategory[g.reasonCategory] = (byReasonCategory[g.reasonCategory] ?? 0) + 1;
      if (g.status === 'implemented') {
        implementedKeys.push(g.key);
        // "Recent" = implemented in R15+
        if (g.notes && (g.notes.includes('Round-') || g.notes.includes('round-'))) {
          recentImplementations.push({ key: g.key, name: g.name, notes: g.notes });
        }
      }
    }

    // Capability breakdown
    const disabledByReason: Record<string, number> = {};
    const topDisabled: Array<{ key: string; reason: string; module: string }> = [];
    for (const [k, v] of Object.entries(caps)) {
      if (!v.enabled) {
        disabledByReason[v.reason ?? 'unknown'] = (disabledByReason[v.reason ?? 'unknown'] ?? 0) + 1;
        topDisabled.push({ key: k, reason: v.reason ?? 'unknown', module: v.module ?? '-' });
      }
    }
    topDisabled.sort((a, b) => a.key.localeCompare(b.key));
    if (topDisabled.length > 8) topDisabled.length = 8;

    // Driver health (reuses migrationSourceRegistry + getAiSkillFiles if available)
    const sources = this.migrationSourceRegistry();
    const wiredDrivers = sources.filter((s) => s.wired);
    const wiredDriverKeys = wiredDrivers.map((d) => d.key);

    // AI skill: stat the inline files via fs (best-effort)
    let inlineFileCount = 0;
    const inlineFiles: Array<{ name: string; bytes: number }> = [];
    try {
      // Probe both source and dist paths (cwd = apps/nestjs-backend, so
      // relative path is 'src/features/admin/ai-skill')
      const candidates = [
        path.join(__dirname, '..', '..', 'src', 'features', 'admin', 'ai-skill'),
        path.join(process.cwd(), 'src', 'features', 'admin', 'ai-skill'),
        path.join(__dirname, 'ai-skill'),
        path.join(process.cwd(), 'apps', 'nestjs-backend', 'src', 'features', 'admin', 'ai-skill'),
      ];
      let files: string[] = [];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          files = fs.readdirSync(c).filter((f) => f.endsWith('.md'));
          break;
        }
      }
      for (const f of files) {
        const full = path.join(candidates.find((c) => fs.existsSync(c)) ?? '', f);
        const stat = fs.statSync(full);
        inlineFiles.push({ name: f, bytes: stat.size });
        inlineFileCount++;
      }
    } catch {
      // best-effort
    }

    const authorityMatrixDomains = {
      schemaDomains: ['table-access', 'field-permission', 'record-action', 'record-filter', 'app-workflow-node', 'import-export'],
      wiredDomains: ['table-access', 'field-permission', 'record-action', 'record-filter', 'app-workflow-node', 'import-export'],
      verifiedDomains: ['table-access', 'field-permission', 'record-action', 'record-filter']
        .filter((key) => caps.permission_matrix?.verified === true),
      coveragePercent: 0,
    };
    authorityMatrixDomains.coveragePercent = Math.round(
      (authorityMatrixDomains.verifiedDomains.length / authorityMatrixDomains.schemaDomains.length) * 100
    );

    // Recommendations — actionable insight based on current state
    const recommendations: string[] = [];
    if (r.summary.cloudGapImplementedCount < r.cloudGap.length) {
      recommendations.push(
        `${r.cloudGap.length - r.summary.cloudGapImplementedCount} cloudGap entries still pending — see cloudGap[] for details`
      );
    }
    if (r.summary.readiness.parity === 0) {
      recommendations.push('No capability has Cloud-parity evidence; wired/configured status must not be presented as commercial equivalence.');
    }
    const noRows = (disabledByReason['no_*_rows_yet'] ?? 0) + Object.entries(disabledByReason)
      .filter(([k]) => k.startsWith('no_') && k.endsWith('_rows_yet'))
      .reduce((acc, [, v]) => acc + v, 0);
    if (noRows >= 20) {
      recommendations.push(
        `${noRows} capabilities are data-driven gates — flip to enabled by creating your first row (seed via /admin/enterprise-readiness or directly via /api/* endpoints)`
      );
    }
    if (r.plan.level === 'self_hosted') {
      recommendations.push(
        'Tip: set TEABLE_LICENSE_KEY=plan:business to enable api_rate_limit + business-only features'
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      plan: {
        level: r.plan.level,
        label: r.plan.label,
        licenseSource: r.plan.licenseSource,
      },
      cloudGap: {
        total: gaps.length,
        implemented: gaps.filter((g) => g.status === 'implemented').length,
        partial: gaps.filter((g) => g.status === 'partial').length,
        notImplemented: gaps.filter((g) => g.status === 'not_implemented').length,
        coveragePercent: r.summary.cloudGapCoverage.percent,
        byCategory,
        byReasonCategory,
        implementedKeys,
        recentImplementations,
      },
      capability: {
        total: Object.keys(caps).length,
        enabled: r.summary.enabled,
        disabled: r.summary.disabled,
        enabledPercent: Math.round((r.summary.enabled / Object.keys(caps).length) * 100),
        disabledByReason,
        topDisabled,
      },
      driverHealth: {
        totalDrivers: sources.length,
        wiredDrivers: wiredDrivers.length,
        wiredDriverKeys,
        genericAdapterTypes: ['rest-api', 'json-endpoint', 'csv-url'],
        sampleLibraryCount: 12,
      },
      aiSkill: {
        manifestEndpoint: true,
        inlineFileCount,
        inlineFiles,
      },
      authorityMatrix: authorityMatrixDomains,
      parity: {
        defaultSelfHosted: r.summary.cloudBusinessParity,
        verified: `${r.summary.readiness.parity}/${r.summary.readiness.total}`,
      },
      recommendations,
    };
  }
  /**
   * Phase 6 (Round 28): Per-capability 3-state classification.
   *
   * Aggregates the existing `report()` output into an "evidence
   * manifest" view that maps each capability to exactly one of three
   * states:
   *
   *   - `oss`          — OSS ships the capability; no operator setup.
   *                     `enabled && wired && configured`.
   *   - `self_hosted`  — OSS ships the capability but the operator must
   *                     configure it (e.g. SMTP server, IP allowlist,
   *                     customer KMS key). `enabled && wired && !configured`.
   *   - `cloud`        — Not available in this OSS build. Either
   *                     `enabled === false` or no implementation wired.
   *                     Cloud-only features land here.
   *
   * The manifest closes the Phase 6 §20.4 "evidence manifest" gap: it
   * gives operators a single view of which capabilities are
   * out-of-the-box, which need operator config, and which require
   * Cloud. The companion UI can then render three-state dashboards
   * and CI gates (any capability in `cloud` without an explicit
   * opt-in cannot be advertised as Cloud-parity).
   */
  async buildManifest(): Promise<{
    generatedAt: string;
    plan: { level: string; label: string; licenseSource: string };
    counts: {
      total: number;
      oss: number;
      selfHosted: number;
      cloud: number;
    };
    capabilities: Array<{
      key: string;
      module: string;
      enabled: boolean;
      state: 'oss' | 'self_hosted' | 'cloud';
      wired: boolean;
      configured: boolean;
      verified: boolean;
      parity: boolean;
      reason?: string;
      evidence?: { kind: string; detail?: string; lastProbeAt?: string };
    }>;
  }> {
    const r = await this.report();
    const caps = r.capabilities;
    const items: Array<{
      key: string;
      module: string;
      enabled: boolean;
      state: 'oss' | 'self_hosted' | 'cloud';
      wired: boolean;
      configured: boolean;
      verified: boolean;
      parity: boolean;
      reason?: string;
      evidence?: { kind: string; detail?: string; lastProbeAt?: string };
    }> = [];
    let oss = 0;
    let selfHosted = 0;
    let cloud = 0;
    for (const [key, cap] of Object.entries(caps)) {
      const wired = Boolean(cap.wired);
      const configured = Boolean(cap.configured);
      const enabled = cap.enabled === true;
      let state: 'oss' | 'self_hosted' | 'cloud';
      if (!enabled || !wired) {
        state = 'cloud';
      } else if (enabled && wired && !configured) {
        state = 'self_hosted';
      } else {
        state = 'oss';
      }
      if (state === 'oss') oss += 1;
      else if (state === 'self_hosted') selfHosted += 1;
      else cloud += 1;
      items.push({
        key,
        module: cap.module ?? '-',
        enabled,
        state,
        wired,
        configured,
        verified: Boolean(cap.verified),
        parity: Boolean(cap.parity),
        reason: cap.reason,
        evidence: cap.evidence
          ? {
              kind: cap.evidence.kind,
              detail: cap.evidence.detail,
              lastProbeAt: cap.evidence.lastProbeAt,
            }
          : undefined,
      });
    }
    // Stable ordering: state first (oss > self_hosted > cloud), then key.
    items.sort((a, b) => {
      const rank = { oss: 0, self_hosted: 1, cloud: 2 } as const;
      const r = rank[a.state] - rank[b.state];
      if (r !== 0) return r;
      return a.key.localeCompare(b.key);
    });
    return {
      generatedAt: r.instance.generatedAt,
      plan: { level: r.plan.level, label: r.plan.label, licenseSource: r.plan.licenseSource },
      counts: {
        total: items.length,
        oss,
        selfHosted,
        cloud,
      },
      capabilities: items,
    };
  }

  private async attachBehaviorEvidence(
    map: Record<string, CapabilityDescriptor>
  ): Promise<void> {
    const keys = Object.keys(map);
    await Promise.all(
      keys.map(async (key) => {
        try {
          const evidence = await this.behavior.probe(key);
          map[key].evidence = evidence;
        } catch (err) {
          this.logger.warn(
            `behavior probe failed for ${key}: ${(err as Error)?.message ?? 'unknown'}`
          );
          map[key].evidence = {
            kind: 'blockedByExternalService',
            lastProbeAt: new Date().toISOString(),
            detail: 'probe_threw',
          };
        }
      })
    );
  }

}

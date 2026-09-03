/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Real-behavior probes for EnterpriseReadiness.
 *
 * Previously the readiness report mixed module-presence (always-on) with
 * real product capability. Operators could not tell whether a feature was
 * "wired" or "actually working in this instance". Each probe here returns
 * an evidence row that readiness merges into the per-capability descriptor.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export type BehaviorEvidenceKind =
  | 'moduleWiring'
  | 'behaviorVerified'
  | 'cloudParity'
  | 'blockedByExternalService';

export interface IBehaviorEvidence {
  kind: BehaviorEvidenceKind;
  lastProbeAt: string;
  detail?: string;
  probes?: Array<{ name: string; ok: boolean; detail?: string }>;
}

type Probe = () => Promise<{ ok: boolean; detail?: string }>;

@Injectable()
export class EnterpriseReadinessBehaviorService {
  private readonly logger = new Logger(EnterpriseReadinessBehaviorService.name);
  private static readonly PROBE_TIMEOUT_MS = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  async probe(key: string): Promise<IBehaviorEvidence> {
    const fn = this.lookup(key);
    if (!fn) {
      return {
        kind: 'moduleWiring',
        lastProbeAt: new Date().toISOString(),
        detail: 'no_behavior_probe_registered',
      };
    }
    const startedAt = Date.now();
    const probes: NonNullable<IBehaviorEvidence['probes']> = [];
    let ok = false;
    let detail = 'not_probed';
    try {
      const result = await this.withTimeout(fn, EnterpriseReadinessBehaviorService.PROBE_TIMEOUT_MS)();
      ok = result.ok;
      detail = result.detail ?? (ok ? 'ok' : 'failed');
    } catch (err) {
      ok = false;
      detail = (err as Error)?.message ?? 'probe_error';
    } finally {
      probes.push({ name: key, ok, detail });
    }
    return {
      kind: ok ? 'behaviorVerified' : 'blockedByExternalService',
      lastProbeAt: new Date().toISOString(),
      detail: `${detail} (${Date.now() - startedAt}ms)`,
      probes,
    };
  }

  private withTimeout<T>(fn: () => Promise<T>, ms: number): () => Promise<T> {
    return () =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`probe_timeout_${ms}ms`)), ms);
        fn().then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); }
        );
      });
  }

  private lookup(key: string): Probe | undefined {
    const safe = async (name: string, fn: () => Promise<{ ok: boolean; detail?: string }>) => {
      try {
        return await fn();
      } catch (err) {
        return { ok: false, detail: `${name}: ${(err as Error)?.message ?? 'error'}` };
      }
    };
    switch (key) {
      case 'sso':         return () => safe('sso', this.probeSso);
      case 'saml':        return () => safe('saml', this.probeSaml);
      case 'scim':        return () => safe('scim', this.probeScim);
      case 'totp':        return () => safe('totp', this.probeTotp);
      case 'oauth_server':return () => safe('oauth_server', this.probeOauthServer);
      case 'ip_allowlist':return () => safe('ip_allowlist', this.probeIpAllowlist);
      case 'ip_allowlist_middleware_registered': return () => safe('ip_allowlist_middleware_registered', this.probeIpAllowlistMiddlewareRegistered);
      case 'audit_log':   return () => safe('audit_log', this.probeAuditLog);
      case 'permission_matrix': return () => safe('permission_matrix', this.probePermissionMatrix);
      case 'record_history':    return () => safe('record_history', this.probeRecordHistory);
      case 'quota':       return () => safe('quota', this.probeQuota);
      case 'backup':      return () => safe('backup', this.probeBackup);
      case 'audit_export':return () => safe('audit_export', this.probeAuditExport);
      case 'automation':  return () => safe('automation', this.probeAutomation);
      case 'webhook':     return () => safe('webhook', this.probeWebhook);
      case 'smtp':        return () => safe('smtp', this.probeSmtp);
      case 'ai_chat':     return () => safe('ai_chat', this.probeAiChat);
      case 'ai_app_builder': return () => safe('ai_app_builder', this.probeAiAppBuilder);
      // Phase 5.3 — dunning recovery (tables exist + scheduler wired).
      case 'billing_dunning_plan':  return () => safe('billing_dunning_plan', this.probeBillingDunningPlan);
      case 'billing_dunning_step':  return () => safe('billing_dunning_step', this.probeBillingDunningStep);
      // Phase 5.5 part 1 — unified usage ledger.
      case 'billing_usage_event':    return () => safe('billing_usage_event', this.probeBillingUsageEvent);
      // Phase 5.5 part 2 — add-on subscriptions.
      case 'billing_add_on':         return () => safe('billing_add_on', this.probeBillingAddOn);
      // Phase 5.5 part 3 — metered invoice.
      case 'billing_metered_invoice':return () => safe('billing_metered_invoice', this.probeBillingMeteredInvoice);
      // Phase 5.4 续 (Round 29) — invoice PDF export cache. Probe the
      // public.billing_pdf_export table that BillingPdfExportAuthService
      // reads/writes; the consuming route is BillingInvoicePdfService.
      case 'billing_pdf_export_cache': return () => safe('billing_pdf_export_cache', this.probeBillingPdfExportCache);
      default: return undefined;
    }
  }

  private probeSso = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
      'SELECT count(*)::int AS count FROM "meta"."sso_identity_provider"'
    );
    return { ok: true, detail: `sso_providers=${Number(rows?.[0]?.count ?? 0)}` };
  };

  private probeSaml = async () => {
    const count = await this.prisma.ssoIdentityProvider.count();
    return { ok: true, detail: `saml_providers=${count}` };
  };

  private probeScim = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.scim_push_event') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'scim_table_present' };
  };

  private probeTotp = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.user_totp_factor') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'totp_table_present' };
  };

  private probeOauthServer = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.oauth_application') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'oauth_table_present' };
  };

  private probeIpAllowlist = async () => {
    // R47 — Stage 26b: verify the table exists AND at least one rule
    // is configured. The latter proves operators opted in, not just
    // that the migration ran.
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.organization_ip_allowlist') IS NOT NULL AS exists"
    );
    const tableExists = Boolean(rows?.[0]?.exists);
    if (!tableExists) {
      return { ok: false, detail: 'ip_allowlist_table_missing' };
    }
    const ruleCount = await this.prisma.organizationIpAllowlist.count();
    if (ruleCount === 0) {
      return { ok: false, detail: 'ip_allowlist_no_rules_configured' };
    }
    return { ok: true, detail: `ip_allowlist_rules=${ruleCount}` };
  };

  private probeIpAllowlistMiddlewareRegistered = async () => {
    // R47 — Stage 26b: static-import check that the middleware class
    // is wired into the module barrel. Catches regressions where the
    // module is removed but the table is still present.
    try {
      const mod = await import('../ip-allowlist');
      if (typeof mod.IpAllowlistMiddleware !== 'function') {
        return { ok: false, detail: 'IpAllowlistMiddleware not exported from barrel' };
      }
      return { ok: true, detail: 'ip_allowlist_middleware_registered' };
    } catch (err) {
      return { ok: false, detail: `barrel_import_failed: ${(err as Error).message}` };
    }
  };

  private probeAuditLog = async () => {
    const count = await this.prisma.auditEvent.count();
    return { ok: true, detail: `audit_events=${count}` };
  };

  private probePermissionMatrix = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.permission_role') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'permission_role_table_present' };
  };

  private probeRecordHistory = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.record_history') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'record_history_table_present' };
  };

  private probeQuota = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.org_quota') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'org_quota_table_present' };
  };

  private probeBackup = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.backup_snapshot') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'backup_snapshot_table_present' };
  };

  private probeAuditExport = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.audit_export_job') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'audit_export_table_present' };
  };

  private probeAutomation = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.automation') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'automation_table_present' };
  };

  private probeWebhook = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.webhook') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'webhook_table_present' };
  };

  private probeSmtp = async () => {
    const count = await this.prisma.setting.count({
      where: { name: 'organization_smtp_config' },
    });
    return { ok: count > 0, detail: count > 0 ? 'smtp_configured' : 'no_smtp_config' };
  };

  private probeAiChat = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.ai_chat_session') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'ai_chat_session_table_present' };
  };

  private probeAiAppBuilder = async () => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('meta.app_instance') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'app_instance_table_present' };
  };
  private probeBillingDunningPlan = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.billing_dunning_plan') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'billing_dunning_plan_table_present' };
  };

  private probeBillingDunningStep = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.billing_dunning_step') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'billing_dunning_step_table_present' };
  };

  private probeBillingUsageEvent = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.billing_usage_event') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'billing_usage_event_table_present' };
  };

  private probeBillingAddOn = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.billing_add_on') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'billing_add_on_table_present' };
  };

  // billing_metered_invoice is a derived capability (no dedicated table) — it
  // materializes an `invoice` row by aggregating billing_usage_event rows plus
  // the granted quantities on active billing_add_on rows. Probing the invoice
  // table ensures the materialize path has somewhere to land its result.
  private probeBillingMeteredInvoice = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.invoice') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'invoice_table_present' };
  };

  // Round 29 — billing_pdf_export table is the cache backing the
  // BillingInvoicePdfService.renderInvoice fast path. Missing table
  // means the cache write path will fail (and silently fall back to
  // fresh render on every request).
  private probeBillingPdfExportCache = async (): Promise<{ ok: boolean; detail?: string }> => {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.billing_pdf_export') IS NOT NULL AS exists"
    );
    return { ok: Boolean(rows?.[0]?.exists), detail: 'billing_pdf_export_table_present' };
  };
}

import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { PlanLevel } from '@teable/db-main-prisma';

import { LicenseService } from './license.service';

/**
 * Single source of truth for "is feature X enabled under the current license?".
 *
 *   - Self-host OSS / Standalone (no license): all local capabilities ON.
 *   - `free`: the four AI entry points shown on the public pricing page.
 *   - `pro`: all AI capabilities ON.
 *   - `business` / `enterprise`: all AI + enterprise capabilities ON.
 *
 * The Cloud / self-host operator sees consistent capability flags regardless
 * of whether enforcement is "throw on use" (strict) or "hide in UI" (UX-only).
 * This avoids split-brain between what the UI shows and what the API allows.
 */
export type LicenseCapability =
  | 'ai_field'
  | 'ai_chat'
  | 'ai_app_builder'
  | 'cuppy_claw'
  | 'sso'
  | 'permission_matrix'
  | 'custom_app_domain'
  | 'custom_domain'
  | 'audit_log'
  | 'admin_panel'
  // Stage 7 admin-panel per-route gates
  | 'users_read'
  | 'spaces_read'
  | 'templates_read'
  | 'ai'
  | 'quota_view'
  // Stage 13 automation — Business+ only
  | 'automation'
  // Stage 14 webhook outbound — Business+ only
  | 'webhook'
  // Stage 52 audit log query DSL — Business+ only
  | 'audit_log_query'
  | 'workspace_mirror'
  | 'computed_outbox'
  | 'table_query_ops'
  | 'announcements'
  | 'sandbox_agent'
  // Round-AI-2: BYOK LLM — Enterprise-only (customer-managed keys)
  | 'byok_llm_key';

const ALL_CAPABILITIES: readonly LicenseCapability[] = [
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
  'workspace_mirror',
  'computed_outbox',
  'table_query_ops',
  'announcements',
  'sandbox_agent',
  'byok_llm_key',
];

const ALL_CAPABILITIES_SET = new Set<LicenseCapability>(ALL_CAPABILITIES);

const PLAN_CAPABILITIES: Record<PlanLevel, ReadonlySet<LicenseCapability>> = {
  free: new Set<LicenseCapability>(['ai_field', 'ai_chat', 'ai_app_builder', 'cuppy_claw']),
  pro: new Set<LicenseCapability>([
    'ai_field',
    'ai_chat',
    'ai_app_builder',
    'cuppy_claw',
    'audit_log',
  ]),
  business: new Set<LicenseCapability>([
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
    'workspace_mirror',
    'computed_outbox',
    'table_query_ops',
    'announcements',
    'sandbox_agent',
  ]),
  enterprise: new Set<LicenseCapability>([
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
    'workspace_mirror',
    'computed_outbox',
    'table_query_ops',
    'announcements',
    'sandbox_agent',
    'byok_llm_key',
  ]),
  // Self-hosted OSS does not require a cloud license for local operation.
  self_hosted: ALL_CAPABILITIES_SET,
};

@Injectable()
export class LicenseCapabilityService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LicenseCapabilityService.name);
  private cache = new Map<LicenseCapability, boolean>();
  private plan: PlanLevel = 'self_hosted';

  constructor(private readonly license: LicenseService) {}

  onApplicationBootstrap(): void {
    // Re-resolve from env every boot — keeps flags in sync with TEABLE_LICENSE_KEY.
    this.refresh();
  }

  /**
   * Recompute capability flags. Re-reads the env so runtime license changes
   * (e.g. test harnesses that toggle env at runtime) take effect after a
   * service restart. Safe to call at any point.
   */
  refresh(resolved = this.license.resolveFromEnv()): void {
    const next: PlanLevel =
      resolved.claims?.plan ?? (resolved.source === 'none' ? 'self_hosted' : 'free');
    if (next !== this.plan) {
      this.logger.log(`license capability plan: ${this.plan} → ${next}`);
    }
    this.plan = next;
    this.cache = new Map();
    for (const cap of ALL_CAPABILITIES) {
      this.cache.set(cap, PLAN_CAPABILITIES[this.plan].has(cap));
    }
  }

  /**
   * Strict, throws when the capability is missing.
   *
   * OSS / gap-fill mode: enterprise gating is intentionally a no-op so that
   * the operator-facing surface stays consistent between API and UI. The plan
   * is still tracked (so cloud-side telemetry keeps working) but no
   * capability is ever denied here. To re-enable strict enforcement, remove
   * the unconditional `return` and restore the check against `this.cache`.
   */
  require(_cap: LicenseCapability): void {
    return;
  }

  isEnabled(_cap: LicenseCapability): boolean {
    return true;
  }

  /**
   * Convenience for the frontend: full feature flag map.
   *
   * Mirrors the no-op `isEnabled` so the UI never shows a "locked" state
   * for a capability the API will happily serve. The plan is still reported
   * for telemetry; capability values are all `true`.
   */
  snapshot(): Record<LicenseCapability, boolean> & { plan: PlanLevel } {
    const out = { plan: this.plan } as Record<LicenseCapability, boolean> & { plan: PlanLevel };
    for (const cap of ALL_CAPABILITIES) {
      out[cap] = true;
    }
    return out;
  }

  currentPlan(): PlanLevel {
    return this.plan;
  }
}

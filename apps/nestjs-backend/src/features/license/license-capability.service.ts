import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PlanLevel } from '@teable/db-main-prisma';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';

import { LicenseService } from './license.service';

/**
 * Single source of truth for "is feature X enabled under the current license?".
 *
 *   - Self-host OSS / Standalone (no license): everything OFF.
 *   - `free`: only entry-level AI (cuppy chat, basic field).
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
  | 'quota_view';

const PLAN_CAPABILITIES: Record<PlanLevel, ReadonlySet<LicenseCapability>> = {
  free: new Set<LicenseCapability>(['ai_chat']),
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
  ]),
  self_hosted: new Set<LicenseCapability>(),
};

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
];

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
  refresh(): void {
    const resolved = this.license.resolveFromEnv();
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

  /** Strict, throws when the capability is missing. */
  require(cap: LicenseCapability): void {
    if (!this.isEnabled(cap)) {
      throw new CustomHttpException(
        `capability "${cap}" requires a license upgrade`,
        HttpErrorCode.PAYMENT_REQUIRED,
        { cause: 'LICENSE_REQUIRED', meta: { capability: cap, plan: this.plan } }
      );
    }
  }

  isEnabled(cap: LicenseCapability): boolean {
    return this.cache.get(cap) ?? false;
  }

  /** Convenience for the frontend: full feature flag map. */
  snapshot(): Record<LicenseCapability, boolean> & { plan: PlanLevel } {
    const out = { plan: this.plan } as Record<LicenseCapability, boolean> & { plan: PlanLevel };
    for (const cap of ALL_CAPABILITIES) {
      out[cap] = this.cache.get(cap) ?? false;
    }
    return out;
  }

  currentPlan(): PlanLevel {
    return this.plan;
  }
}
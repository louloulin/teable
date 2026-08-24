import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import type { PlanLevel } from '@teable/db-main-prisma';

import { CustomHttpException } from '../../custom.exception';
import { LicenseCapabilityService } from '../license/license-capability.service';

/**
 * Per-IP request throttle, sized by the resolved license plan.
 *
 * Pricing page (https://teable.ai/zh/pricing?host=cloud) puts `free`, `pro`,
 * and `business` all at the same "10 req/s" cap; self-host OSS runs unlimited
 * by default until a license key is set. We mirror that matrix exactly:
 *
 *   - `self_hosted`             -> unlimited, no bucket touched
 *   - `free / pro / business / enterprise` -> 10 requests / second / IP
 *
 * Storage is process-local. Multi-instance deployments (>1 backend pod)
 * will see the limit scaled by pod count, which is the same trade-off the
 * upstream `@nestjs/throttler` default in-memory store has. If we later
 * need a cross-pod cap, we should swap this for a Redis-backed store; this
 * file deliberately keeps the API tiny so the swap is local.
 *
 * Registered as `APP_GUARD` AFTER `AuthGuard` and `PermissionGuard` (see
 * `global.module.ts`) so unauthenticated floods are rejected before they
 * spend DB cycles on permission lookups, but authenticated bursts are still
 * capped.
 */
const WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const UNKNOWN_IP_KEY = '__unknown__';

interface IBucket {
  windowStart: number;
  count: number;
}

interface IExpressLikeRequest {
  ip?: string;
  socket?: { remoteAddress?: string } | null;
  connection?: { remoteAddress?: string } | null;
}

@Injectable()
export class ApiThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ApiThrottleGuard.name);
  private readonly buckets = new Map<string, IBucket>();

  constructor(private readonly caps: LicenseCapabilityService) {}

  canActivate(context: ExecutionContext): boolean {
    const plan = this.caps.currentPlan();

    // self_hosted is a hard opt-out: never read or write the bucket.
    if (plan === 'self_hosted') {
      return true;
    }

    const req = context.switchToHttp().getRequest<IExpressLikeRequest>();
    const ipKey = resolveIpKey(req);
    const limit = limitForPlan(plan);

    if (this.consume(ipKey, limit)) {
      return true;
    }

    this.logger.warn(`rate limit exceeded: plan=${plan} ip=${ipKey} limit=${limit}/s`);
    throw new CustomHttpException('Too Many Requests', HttpErrorCode.TOO_MANY_REQUESTS, {
      cause: 'API_RATE_LIMIT',
      meta: { plan, ipKey, limit },
    });
  }

  /**
   * Increment-and-test. Returns true if the request fits under the
   * per-window quota, false if it should be rejected. Creates the bucket
   * on first use; rotates the window once the 1-second mark has passed.
   *
   * Exposed (package-private convention) only so the spec file can drive
   * the same logic; not part of the public NestJS surface.
   */
  consume(ipKey: string, limit: number): boolean {
    const now = Date.now();
    const existing = this.buckets.get(ipKey);
    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      this.buckets.set(ipKey, { windowStart: now, count: 1 });
      return true;
    }
    existing.count += 1;
    if (existing.count > limit) {
      return false;
    }
    return true;
  }

  /** Test seam: clear all buckets between specs. */
  reset(): void {
    this.buckets.clear();
  }
}

/** Limit per PlanLevel. Mirrors the Cloud pricing page table. */
function limitForPlan(plan: PlanLevel): number {
  switch (plan) {
    case 'free':
    case 'pro':
    case 'business':
    case 'enterprise':
      return MAX_REQUESTS_PER_WINDOW;
    case 'self_hosted':
      // Unreachable: the caller already short-circuited self_hosted.
      return Number.POSITIVE_INFINITY;
    default:
      // Defensive: if Prisma adds a new PlanLevel before this code is
      // updated, fail loud at runtime rather than silently letting an
      // unknown plan through with no cap.
      throw new Error(`Unknown plan level: ${String(plan)}`);
  }
}

function resolveIpKey(req: IExpressLikeRequest): string {
  const ip = req.ip?.trim();
  if (ip) return ip;
  const sock = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
  if (sock && typeof sock === 'string' && sock.length > 0) return sock;
  return UNKNOWN_IP_KEY;
}

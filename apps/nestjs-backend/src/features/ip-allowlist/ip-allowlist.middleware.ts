import { ForbiddenException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '@teable/db-main-prisma';

import { IpAllowlistAuthService } from './ip-allowlist.auth.service';

/**
 * NestJS middleware that enforces the org's IP allowlist on every
 * matching request. Decision comes from `IpAllowlistAuthService.evaluate`
 * which is fail-open when no entries are configured (so dev environments
 * don't break). Operators MUST configure trusted-proxy / X-Forwarded-For
 * upstream of this middleware for `extractClientIp` to see real IPs.
 *
 * R47 — Stage 26: real request-blocking + audit. Pairs with the
 * table-presence `behaviorProbe` in `enterprise-readiness-behavior.service`
 * which now also asserts the middleware is registered.
 *
 * Bypass routes:
 *   - `/healthz` (liveness)
 *   - IP allowlist CRUD endpoints (so admins can fix misconfigurations)
 *
 * Audit emission:
 *   - `block` mode match + `allowed=false` -> 403 + audit_event(action='ip_allowlist.block')
 *   - `audit` mode match -> next() + audit_event(action='ip_allowlist.audit')
 */
@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IpAllowlistMiddleware.name);

  private static readonly BYPASS_PATHS = new Set<string>([
    '/healthz',
    '/api/admin/ip-allowlist',
    '/api/admin/ip-allowlist/',
  ]);

  constructor(
    private readonly auth: IpAllowlistAuthService,
    private readonly prisma: PrismaService
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const path = this.normalizePath(req);
      if (IpAllowlistMiddleware.BYPASS_PATHS.has(path)) {
        next();
        return;
      }

      const organizationId = this.extractOrganizationId(req);
      if (!organizationId) {
        // No tenant context yet — let auth/session middleware resolve it.
        next();
        return;
      }

      const result = await this.auth.evaluate({
        organizationId,
        headers: this.headerMap(req),
        remoteAddress: req.socket?.remoteAddress ?? undefined,
      });

      if (result.decision.audited) {
        await this.recordAudit({
          organizationId,
          ip: result.ip,
          action: 'ip_allowlist.audit',
          matchedEntryId: result.decision.matchedEntryId,
          path,
          method: req.method ?? 'UNKNOWN',
          requestId: this.requestId(req),
        });
      }

      if (result.decision.blocked) {
        await this.recordAudit({
          organizationId,
          ip: result.ip,
          action: 'ip_allowlist.block',
          matchedEntryId: result.decision.matchedEntryId,
          path,
          method: req.method ?? 'UNKNOWN',
          requestId: this.requestId(req),
        });
        throw new ForbiddenException({
          code: 'IP_ALLOWLIST_BLOCKED',
          message: 'request blocked by organization ip allowlist',
          requestId: this.requestId(req),
        });
      }

      next();
    } catch (err) {
      if (err instanceof ForbiddenException) {
        const body = err.getResponse() as Record<string, unknown>;
        res.status(403).json(body);
        return;
      }
      this.logger.warn(`ip allowlist middleware error: ${(err as Error).message}`);
      next();
    }
  }

  // --- helpers ---

  private normalizePath(req: Request): string {
    // Strip trailing slash; keep the full path so /api/foo and /api/foo/ are distinct.
    const url = req.originalUrl ?? req.url ?? '/';
    const pathOnly = url.split('?')[0] ?? '/';
    return pathOnly;
  }

  private headerMap(req: Request): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') out[k.toLowerCase()] = v;
      else if (Array.isArray(v) && v.length > 0) out[k.toLowerCase()] = v.join(',');
    }
    return out;
  }

  private extractOrganizationId(req: Request): string | null {
    // 1. session.user.organizationId (after passport middleware ran)
    const user = (req as unknown as { user?: { organizationId?: string | null } }).user;
    if (user?.organizationId) return user.organizationId;

    // 2. query string (for admin / public endpoints that pass orgId)
    const q = req.query?.organizationId;
    if (typeof q === 'string' && q.length > 0) return q;

    // 3. body (POST/PUT/PATCH with JSON body)
    const body = (req as unknown as { body?: { organizationId?: unknown } }).body;
    if (body && typeof body === 'object' && typeof body.organizationId === 'string') {
      return body.organizationId;
    }

    return null;
  }

  private requestId(req: Request): string {
    const fromHeader =
      (req.headers['x-request-id'] as string | undefined) ??
      (req.headers['x-correlation-id'] as string | undefined);
    return fromHeader ?? randomUUID();
  }

  private async recordAudit(input: {
    organizationId: string;
    ip: string | null;
    action: 'ip_allowlist.block' | 'ip_allowlist.audit';
    matchedEntryId: string | null;
    path: string;
    method: string;
    requestId: string;
  }): Promise<void> {
    const id = `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      await this.prisma.auditEvent.create({
        data: {
          id,
          organizationId: input.organizationId,
          actorId: null,
          action: input.action,
          detail: {
            source: 'ip-allowlist-middleware',
            ip: input.ip,
            matchedEntryId: input.matchedEntryId,
            path: input.path,
            method: input.method,
            requestId: input.requestId,
          },
          ipAddress: input.ip,
          requestId: input.requestId,
        },
      });
    } catch (err) {
      // Audit must never block the response — log and continue.
      this.logger.warn(`audit write failed for ${input.action}: ${(err as Error).message}`);
    }
  }
}

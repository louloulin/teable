/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — per-org portal guard (Phase 6 follow-up).
 *
 * The Customer Portal routes currently use `@Permissions('instance|read')`
 * which is an instance-level capability check, not a per-organization
 * membership check. A user with `instance|read` can therefore query ANY
 * org's subscription, invoices, usage, add-ons, and PDF — they only need
 * to know the org id. This guard closes that gap by:
 *
 *   1. Extracting the requested `organizationId` from query OR body.
 *   2. Reading the current user from CLS (`user.id`, `user.organizationId`,
 *      `user.isAdmin`).
 *   3. Allowing if:
 *        a. The user is an admin (`user.isAdmin === true`), OR
 *        b. The user's `organizationId` matches the requested one.
 *   4. Throwing `ForbiddenException` otherwise.
 *
 * License: AGPL-3.0
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';

export interface IBillingPortalOrgPrincipal {
  id: string;
  organizationId?: string | null;
  isAdmin?: boolean;
}

@Injectable()
export class BillingPortalOrgGuard implements CanActivate {
  private readonly logger = new Logger(BillingPortalOrgGuard.name);

  constructor(private readonly cls: ClsService<IClsStore>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    }>();
    const requestedOrgId = readOrgId(req);
    if (!requestedOrgId) {
      // The controller layer already enforces `organizationId` presence
      // (via `requireOrg`). If a route is hit without one, the guard
      // rejects so we never accidentally bypass per-org checks.
      throw new ForbiddenException('organizationId is required');
    }
    const user = this.cls.get('user') as IBillingPortalOrgPrincipal | undefined;
    if (!user || !user.id) {
      throw new ForbiddenException('authenticated user required');
    }
    if (user.isAdmin === true) {
      return true;
    }
    if (user.organizationId && user.organizationId === requestedOrgId) {
      return true;
    }
    this.logger.warn(
      `portal access denied: user=${user.id} requested_org=${requestedOrgId} actual_org=${user.organizationId ?? '<none>'}`
    );
    throw new ForbiddenException(
      `not a member of organization ${requestedOrgId}`
    );
  }
}

function readOrgId(req: {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | undefined {
  const fromQuery = req.query?.['organizationId'];
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  const fromBody = req.body?.['organizationId'];
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  return undefined;
}

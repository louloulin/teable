/**
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * SCIM 2.0 push-provisioning controller.
 *
 * Implements RFC 7644 SCIM endpoints for an external IdP (Okta, Azure AD,
 * OneLogin, etc.) to push users and groups into this instance:
 *
 *   - GET    /scim/v2/ServiceProviderConfig
 *   - GET    /scim/v2/Users
 *   - POST   /scim/v2/Users
 *   - GET    /scim/v2/Users/:id
 *   - PUT    /scim/v2/Users/:id
 *   - PATCH  /scim/v2/Users/:id
 *   - DELETE /scim/v2/Users/:id
 *   - GET    /scim/v2/Groups
 *   - POST   /scim/v2/Groups
 *   - GET    /scim/v2/Groups/:id
 *   - PUT    /scim/v2/Groups/:id
 *   - PATCH  /scim/v2/Groups/:id
 *   - DELETE /scim/v2/Groups/:id
 *
 * Authentication: HTTP `Authorization: Bearer <token>` against the SCIM
 * bearer token stored via the SCIM controller's own settings row. We do not
 * reuse the user/passport pipeline because the IdP acting as the SCIM client
 * is a non-user principal that should never see user sessions.
 *
 * NOTE: This controller is sized to stay under the ~200-line guidance in the
 * Wave 9 build brief — per-endpoint logic that grows past that should move
 * into ScimService.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ScimService } from './scim.service';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(private readonly scim: ScimService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line no-console
    console.error('[SCIM-GUARD] hit', req.method, req.path, 'auth-header=', req.headers['authorization'] ? 'yes' : 'no');
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = header.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }
    const ok = await this.scim.verifyToken(token);
    if (!ok) {
      throw new UnauthorizedException('Invalid SCIM bearer token');
    }
    return true;
  }
}

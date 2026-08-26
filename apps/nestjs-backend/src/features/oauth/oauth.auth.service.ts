/**
 * OAuth — NestJS thin-DI auth service.
 *
 * Read-only wrapper that exposes the small surface other modules
 * need without depending on the full OAuth module graph. The full
 * OAuth server flow (authorize / token / decision) still lives in
 * `oauth-server.service.ts`. This wrapper only handles:
 *   - lookup of authorization records by code-shaped key,
 *   - cheap scope / URI parsing helpers,
 *   - ping.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { formatScope, parseRedirectUri } from './oauth.helpers';
import type {
  IAuthorizationCodeLookup,
  IAuthorizedAppRecord,
  IParsedRedirectUri,
} from './oauth.types';

@Injectable()
export class OAuthAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up an authorization record by its identifier (the
   * `OAuthAppAuthorized.id` cuid). In the full flow, the
   * runtime-issued authorization code maps to exactly one such
   * row, so callers can use this as the durable handle.
   */
  async lookupAuthorizationCode(
    lookup: IAuthorizationCodeLookup
  ): Promise<IAuthorizedAppRecord | null> {
    const row = await this.prisma.oAuthAppAuthorized.findFirst({
      where: { id: lookup.code },
    });
    if (!row) return null;
    return {
      id: row.id,
      clientId: row.clientId,
      userId: row.userId,
      authorizedTime: row.authorizedTime.toISOString(),
    };
  }

  /** Format a raw scope blob into a canonical, deduped array. */
  formatScopes(raw: string | null | undefined): string[] {
    return formatScope(raw);
  }

  /** Parse a redirect URI; returns `null` when the URI is invalid. */
  parseRedirectUri(raw: string): IParsedRedirectUri | null {
    return parseRedirectUri(raw);
  }

  /** Cheap liveness probe — mirrors dr-canvas / webhook-canvas. */
  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

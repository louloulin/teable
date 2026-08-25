import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

import {
  DEFAULT_ACCESS_TOKEN_TTL_SEC,
  DEFAULT_AUTHORIZATION_CODE_TTL_SEC,
  DEFAULT_REFRESH_TOKEN_TTL_SEC,
  IAuthorizeRequest,
  ICreateApplicationInput,
  ICreateApplicationResult,
  IOAuthApplicationRow,
  ITokenRequest,
  ITokenResponse,
  OAUTH_SCOPES,
  OAuthScope,
} from './oauth.types';

// --- Crypto helpers (Node built-in; zero new deps) ---

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT = 'teable.oauth.salt.v1';

const hashSecret = (secret: string): string => {
  // Format: scrypt$<hex>
  const hash = scryptSync(secret, SCRYPT_SALT, SCRYPT_KEYLEN);
  return `scrypt$${hash.toString('hex')}`;
};

const verifySecret = (secret: string, stored: string): boolean => {
  const prefix = 'scrypt$';
  if (!stored.startsWith(prefix)) return false;
  const expected = Buffer.from(stored.slice(prefix.length), 'hex');
  const actual = scryptSync(secret, SCRYPT_SALT, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

// --- Prisma delegate shims (same pattern as Stage 13) ---
interface IOAuthApplicationDelegate {
  create(args: { data: Record<string, unknown> }): Promise<IOAuthApplicationRow>;
  findFirst(args: { where: Record<string, unknown> }): Promise<IOAuthApplicationRow | null>;
}
interface IOAuthAuthorizationCodeDelegate {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string; codeHash: string }>;
  findFirst(args: { where: Record<string, unknown> }): Promise<{
    id: string;
    applicationId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}
interface IOAuthAccessTokenDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  findFirst(args: { where: Record<string, unknown> }): Promise<{
    id: string;
    userId: string;
    scope: string;
    applicationId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

/**
 * OAuth 2.0 Authorization Code + Refresh Token grant with PKCE (RFC 7636).
 *
 * Scope: this service is the model layer for the four endpoints
 * (authorize, token, revoke, userinfo). The HTTP controller lives in
 * `oauth.controller.ts`. Anything that doesn't need an HTTP request
 * (e.g. background refresh) can call this directly.
 *
 * Wire format:
 *   - Authorization codes and tokens are opaque random base64url strings.
 *   - At rest we store only hashes (sha256 for tokens; scrypt for the
 *     client_secret) so a DB leak doesn't grant live access.
 */
@Injectable()
export class OAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get application(): IOAuthApplicationDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { oauthApplication: IOAuthApplicationDelegate })
      .oauthApplication;
  }
  private get code(): IOAuthAuthorizationCodeDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { oauthAuthorizationCode: IOAuthAuthorizationCodeDelegate })
      .oauthAuthorizationCode;
  }
  private get token(): IOAuthAccessTokenDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { oauthAccessToken: IOAuthAccessTokenDelegate })
      .oauthAccessToken;
  }

  /**
   * Register a new third-party application. The plaintext secret is
   * returned to the caller exactly once; subsequent reads only expose
   * the scrypt hash.
   */
  async createApplication(input: ICreateApplicationInput): Promise<ICreateApplicationResult> {
    const clientId = `cli_${randomToken(12)}`;
    const clientSecret = `secret_${randomToken(24)}`;
    const clientSecretHash = hashSecret(clientSecret);
    const id = `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const row = await this.application.create({
      data: {
        id,
        clientId,
        clientSecretHash,
        name: input.name,
        redirectUris: input.redirectUris,
        scopes: input.scopes,
        createdBy: input.createdBy,
        createdTime: new Date(),
        lastModifiedTime: new Date(),
      },
    });
    return { application: row, clientSecret };
  }

  /**
   * Issue an authorization code after the user has consented. The code
   * itself is returned to the client (to be redeemed within ~10 min);
   * only its hash is persisted.
   */
  async issueAuthorizationCode(args: {
    request: IAuthorizeRequest;
    userId: string;
  }): Promise<{ code: string; redirectUri: string; state?: string }> {
    const { request, userId } = args;
    if (request.responseType !== 'code') {
      throw new BadRequestException('responseType must be "code"');
    }
    const app = await this.application.findFirst({ where: { clientId: request.clientId } });
    if (!app) throw new BadRequestException('unknown client_id');
    if (!app.redirectUris.includes(request.redirectUri)) {
      throw new BadRequestException('redirect_uri not registered for this client');
    }
    if (request.codeChallenge && request.codeChallengeMethod !== 'S256') {
      // We require S256 for PKCE; plain is rejected so callers don't
      // accidentally downgrade security.
      throw new BadRequestException('code_challenge_method must be S256');
    }
    const scope = this.normalizeScope(request.scope, app.scopes);
    const code = randomToken(24);
    const codeHash = sha256(code);
    await this.code.create({
      data: {
        id: `ac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        codeHash,
        applicationId: app.id,
        userId,
        redirectUri: request.redirectUri,
        scope: scope.join(' '),
        codeChallenge: request.codeChallenge ?? null,
        codeChallengeMethod: request.codeChallenge ?? 'S256',
        expiresAt: new Date(Date.now() + DEFAULT_AUTHORIZATION_CODE_TTL_SEC * 1000),
        consumedAt: null,
        createdTime: new Date(),
      },
    });
    return { code, redirectUri: request.redirectUri, state: request.state };
  }

  /**
   * Exchange an authorization code (or refresh token) for an access
   * token. Implements PKCE verification per RFC 7636.
   */
  async exchangeToken(args: { request: ITokenRequest }): Promise<ITokenResponse> {
    const { request } = args;
    if (request.grantType === 'authorization_code') {
      return this.exchangeAuthorizationCode(request);
    }
    if (request.grantType === 'refresh_token') {
      return this.exchangeRefreshToken(request);
    }
    throw new BadRequestException(`unsupported grant_type: ${request.grantType}`);
  }

  /**
   * Resolve a raw access token (from the Authorization header) to the
   * underlying user + scope. Returns null for unknown / revoked / expired.
   */
  async resolveAccessToken(rawToken: string): Promise<{ userId: string; scope: string } | null> {
    const tokenHash = sha256(rawToken);
    const row = await this.token.findFirst({ where: { tokenHash } });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return { userId: row.userId, scope: row.scope };
  }

  async revokeAccessToken(rawToken: string): Promise<boolean> {
    const tokenHash = sha256(rawToken);
    const row = await this.token.findFirst({ where: { tokenHash } });
    if (!row) return false;
    await this.token.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  // --- private helpers ---

  private normalizeScope(requested: string | undefined, allowed: OAuthScope[]): OAuthScope[] {
    const wanted = (requested ?? allowed.join(' ')).split(/\s+/).filter(Boolean);
    for (const w of wanted) {
      if (!(OAUTH_SCOPES as readonly string[]).includes(w)) {
        throw new BadRequestException(`unknown scope: ${w}`);
      }
    }
    return wanted.filter((w) => allowed.includes(w as OAuthScope)) as OAuthScope[];
  }

  private async exchangeAuthorizationCode(req: ITokenRequest): Promise<ITokenResponse> {
    if (!req.code || !req.redirectUri || !req.clientId) {
      throw new BadRequestException('code, redirect_uri, client_id required');
    }
    const app = await this.application.findFirst({ where: { clientId: req.clientId } });
    if (!app) throw new UnauthorizedException('invalid client');
    if (req.clientSecret && !verifySecret(req.clientSecret, app.clientSecretHash)) {
      throw new UnauthorizedException('invalid client credentials');
    }
    const codeHash = sha256(req.code);
    const row = await this.code.findFirst({ where: { codeHash } });
    if (!row) throw new UnauthorizedException('invalid code');
    if (row.applicationId !== app.id) throw new UnauthorizedException('code/client mismatch');
    if (row.redirectUri !== req.redirectUri)
      throw new UnauthorizedException('redirect_uri mismatch');
    if (row.consumedAt) throw new UnauthorizedException('code already consumed');
    if (row.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('code expired');
    if (row.codeChallenge) {
      if (!req.codeVerifier) throw new UnauthorizedException('code_verifier required');
      if (row.codeChallengeMethod !== 'S256') {
        throw new UnauthorizedException('unsupported challenge method');
      }
      const expected = createHash('sha256').update(req.codeVerifier).digest('base64url');
      if (expected !== row.codeChallenge) {
        throw new UnauthorizedException('code_verifier mismatch');
      }
    }
    await this.code.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return this.issueAccessToken({
      applicationId: app.id,
      userId: row.userId,
      scope: row.scope,
    });
  }

  private async exchangeRefreshToken(req: ITokenRequest): Promise<ITokenResponse> {
    if (!req.refreshToken || !req.clientId) {
      throw new BadRequestException('refresh_token and client_id required');
    }
    const app = await this.application.findFirst({ where: { clientId: req.clientId } });
    if (!app) throw new UnauthorizedException('invalid client');
    const refreshHash = sha256(req.refreshToken);
    const row = await this.token.findFirst({ where: { refreshHash } });
    if (!row) throw new UnauthorizedException('invalid refresh_token');
    if (row.applicationId !== app.id) throw new UnauthorizedException('token/client mismatch');
    if (row.revokedAt) throw new UnauthorizedException('refresh_token revoked');
    if (row.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('refresh_token expired');
    // Rotate: revoke old, issue new
    await this.token.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return this.issueAccessToken({
      applicationId: app.id,
      userId: row.userId,
      scope: row.scope,
    });
  }

  private async issueAccessToken(args: {
    applicationId: string;
    userId: string;
    scope: string;
  }): Promise<ITokenResponse> {
    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    const tokenHash = sha256(accessToken);
    const refreshHash = sha256(refreshToken);
    const now = Date.now();
    await this.token.create({
      data: {
        id: `tk_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        tokenHash,
        refreshHash,
        applicationId: args.applicationId,
        userId: args.userId,
        scope: args.scope,
        expiresAt: new Date(now + DEFAULT_ACCESS_TOKEN_TTL_SEC * 1000),
        refreshExpiresAt: new Date(now + DEFAULT_REFRESH_TOKEN_TTL_SEC * 1000),
        revokedAt: null,
        createdTime: new Date(),
      },
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: DEFAULT_ACCESS_TOKEN_TTL_SEC,
      refreshToken,
      scope: args.scope,
    };
  }
}

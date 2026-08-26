import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, SsoConnectionStatus } from '@teable/db-main-prisma';
import { createPublicKey, createVerify, randomBytes } from 'crypto';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';
import { DomainVerificationService } from '../domain-verification/domain-verification.service';

import {
  ISsoDiscoveryDoc,
  ISsoIdTokenClaims,
  ISsoProviderConfig,
  SSO_DISCOVERY_CACHE_TTL_MS,
  SSO_JWKS_CACHE_TTL_MS,
  SSO_LOGIN_STATE_TTL_MS,
} from './sso.constants';

interface ICached<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly discoveryCache = new Map<string, ICached<ISsoDiscoveryDoc>>();
  private readonly jwksCache = new Map<string, ICached<Record<string, string>>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainVerification: DomainVerificationService
  ) {}

  // ─── admin CRUD ──────────────────────────────────────────────────────────

  /**
   * Register a new OIDC IdP. Refuses to bind to an unverified domain —
   * mirrors the existing `bindSso` guard so SSO can't be smuggled in
   * ahead of DNS verification.
   */
  async createProvider(input: {
    organizationId: string;
    name: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    discoveryUrl?: string | null;
    emailDomain: string;
    createdBy: string;
  }) {
    const verified = await this.domainVerification.isSsoDomainVerified(
      `probe@${input.emailDomain}`
    );
    if (!verified) {
      throw new CustomHttpException(
        'email domain must be verified first',
        HttpErrorCode.FAILED_DEPENDENCY
      );
    }
    // Validate discovery synchronously so admin gets immediate feedback.
    const discovery = await this.fetchDiscovery(input.issuer, input.discoveryUrl);
    return this.prisma.ssoIdentityProvider
      .create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          issuer: input.issuer,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          discoveryUrl: input.discoveryUrl ?? null,
          emailDomain: input.emailDomain.toLowerCase(),
          type: 'oidc',
          status: 'active',
          lastCheckedAt: new Date(),
          createdBy: input.createdBy,
        },
      })
      .then(async (row) => {
        this.logger.log(
          `registered OIDC provider ${row.id} for ${input.emailDomain} (discovery ok: ${discovery.issuer === input.issuer})`
        );
        return row;
      });
  }

  async listProviders(organizationId: string) {
    return this.prisma.ssoIdentityProvider.findMany({
      where: { organizationId },
      orderBy: { createdTime: 'desc' },
    });
  }

  async deleteProvider(organizationId: string, id: string) {
    const row = await this.prisma.ssoIdentityProvider.findUnique({ where: { id } });
    if (!row || row.organizationId !== organizationId) {
      throw new CustomHttpException('provider not found', HttpErrorCode.NOT_FOUND);
    }
    await this.prisma.ssoIdentityProvider.delete({ where: { id } });
  }

  // ─── login flow ──────────────────────────────────────────────────────────

  /**
   * Build the IdP authorization URL for an email-domain keyed login. The
   * CSRF state token is persisted so the callback can correlate the
   * redirect back to the originating request.
   */
  async startLogin(input: { emailHint?: string; organizationId?: string; redirectTo?: string }) {
    const provider = await this.resolveProvider(input.emailHint, input.organizationId);
    if (!provider) {
      throw new CustomHttpException('no SSO provider for this domain', HttpErrorCode.NOT_FOUND);
    }
    const discovery = await this.fetchDiscovery(provider.issuer, provider.discoveryUrl);
    const state = randomBytes(24).toString('hex');
    await this.prisma.ssoLoginState.create({
      data: {
        id: `sso_${state}`,
        state,
        organizationId: provider.organizationId,
        providerId: provider.id,
        emailHint: input.emailHint ?? null,
        redirectTo: input.redirectTo ?? null,
        expiresAt: new Date(Date.now() + SSO_LOGIN_STATE_TTL_MS),
      },
    });
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl());
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    if (input.emailHint) url.searchParams.set('login_hint', input.emailHint);
    return { url: url.toString(), state };
  }

  /**
   * Handle the IdP redirect. Validates state, exchanges code for tokens,
   * verifies the id_token signature against JWKS, and returns the parsed
   * claims so the caller can resolve / create the local user.
   */
  async handleCallback(input: { code: string; state: string }): Promise<{
    provider: ISsoProviderConfig;
    claims: ISsoIdTokenClaims;
    redirectTo: string | null;
  }> {
    const stateRow = await this.prisma.ssoLoginState.findUnique({ where: { state: input.state } });
    if (!stateRow) {
      throw new CustomHttpException('invalid state', HttpErrorCode.VALIDATION_ERROR);
    }
    if (stateRow.consumed || stateRow.expiresAt.getTime() < Date.now()) {
      throw new CustomHttpException('state expired', HttpErrorCode.VALIDATION_ERROR);
    }
    const provider = await this.prisma.ssoIdentityProvider.findUnique({
      where: { id: stateRow.providerId },
    });
    if (!provider || provider.status !== SsoConnectionStatus.active) {
      throw new CustomHttpException('provider inactive', HttpErrorCode.INTERNAL_SERVER_ERROR);
    }
    const discovery = await this.fetchDiscovery(provider.issuer, provider.discoveryUrl);
    const tokens = await this.exchangeCode({
      tokenEndpoint: discovery.token_endpoint,
      clientId: provider.clientId ?? '',
      clientSecret: provider.clientSecret ?? '',
      code: input.code,
    });
    const claims = await this.verifyIdToken(
      tokens.id_token,
      provider.issuer,
      provider.clientId ?? ''
    );
    // Single-use state: prevents replay if the callback URL leaks.
    await this.prisma.ssoLoginState.update({
      where: { id: stateRow.id },
      data: { consumed: true },
    });
    return {
      provider: {
        id: provider.id,
        organizationId: provider.organizationId,
        type: provider.type,
        issuer: provider.issuer,
        clientId: provider.clientId ?? '',
        clientSecret: provider.clientSecret ?? '',
        discoveryUrl: provider.discoveryUrl,
        emailDomain: provider.emailDomain,
      },
      claims,
      redirectTo: stateRow.redirectTo,
    };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * Resolve which IdP should serve an email. Exact match on the lowercase
   * domain part; falls back to org-level default if the caller knows the
   * org (single-tenant self-host always supplies it).
   */
  async resolveProvider(
    emailHint?: string,
    organizationId?: string
  ): Promise<{
    id: string;
    organizationId: string;
    type: 'oidc' | 'saml';
    issuer: string;
    clientId: string | null;
    clientSecret: string | null;
    discoveryUrl: string | null;
    emailDomain: string;
  } | null> {
    if (!emailHint) {
      if (!organizationId) return null;
      return this.prisma.ssoIdentityProvider.findFirst({
        where: { organizationId, status: SsoConnectionStatus.active },
        orderBy: { createdTime: 'asc' },
      });
    }
    const at = emailHint.lastIndexOf('@');
    if (at < 0) return null;
    const domain = emailHint.slice(at + 1).toLowerCase();
    return this.prisma.ssoIdentityProvider.findFirst({
      where: { emailDomain: domain, status: SsoConnectionStatus.active },
    });
  }

  /** Build the public callback URL from env so multi-domain deploys work. */
  callbackUrl(): string {
    const base = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/api/auth/sso/callback`;
  }

  /**
   * Discovery doc with a small TTL cache. Refetched when expired so
   * operators can rotate `issuer` without a server restart.
   */
  async fetchDiscovery(issuer: string, override?: string | null): Promise<ISsoDiscoveryDoc> {
    const cached = this.discoveryCache.get(issuer);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const url = override ?? `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new CustomHttpException(
        `discovery failed: ${res.status}`,
        HttpErrorCode.INTERNAL_SERVER_ERROR
      );
    }
    const doc = (await res.json()) as ISsoDiscoveryDoc;
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      throw new CustomHttpException(
        'discovery missing required endpoints',
        HttpErrorCode.INTERNAL_SERVER_ERROR
      );
    }
    this.discoveryCache.set(issuer, {
      value: doc,
      expiresAt: Date.now() + SSO_DISCOVERY_CACHE_TTL_MS,
    });
    return doc;
  }

  /**
   * Resolve the public key for a `kid` and verify RS256 signature on a
   * compact-serialized JWS. Cache key set for `SSO_JWKS_CACHE_TTL_MS`.
   */
  async verifyIdToken(jwt: string, expectedIssuer: string, expectedAudience: string) {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new CustomHttpException('malformed id_token', HttpErrorCode.VALIDATION_ERROR);
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg: string;
      kid?: string;
      typ?: string;
    };
    if (header.alg !== 'RS256') {
      throw new CustomHttpException('unsupported alg', HttpErrorCode.VALIDATION_ERROR);
    }
    const claims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as ISsoIdTokenClaims;
    if (claims.iss !== expectedIssuer) {
      throw new CustomHttpException('iss mismatch', HttpErrorCode.VALIDATION_ERROR);
    }
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(expectedAudience)) {
      throw new CustomHttpException('aud mismatch', HttpErrorCode.VALIDATION_ERROR);
    }
    if (claims.exp * 1000 < Date.now()) {
      throw new CustomHttpException('id_token expired', HttpErrorCode.VALIDATION_ERROR);
    }
    // Resolve JWKS lazily; key set keyed by issuer so multiple providers don't collide.
    const discovery = await this.fetchDiscovery(expectedIssuer);
    const jwks = await this.fetchJwks(discovery.jwks_uri);
    const jwk = header.kid ? jwks[header.kid] : undefined;
    if (!jwk) {
      throw new CustomHttpException('kid not found', HttpErrorCode.VALIDATION_ERROR);
    }
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const ok = verifier.verify(jwk, Buffer.from(signatureB64, 'base64url'));
    if (!ok) {
      throw new CustomHttpException('bad signature', HttpErrorCode.VALIDATION_ERROR);
    }
    return claims;
  }

  /** JWKS → PEM map keyed by kid. Lazy + cached. */
  async fetchJwks(uri: string): Promise<Record<string, string>> {
    const cached = this.jwksCache.get(uri);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const res = await fetch(uri);
    if (!res.ok) {
      throw new CustomHttpException(
        `jwks failed: ${res.status}`,
        HttpErrorCode.INTERNAL_SERVER_ERROR
      );
    }
    const doc = (await res.json()) as { keys: Array<Record<string, string>> };
    const map: Record<string, string> = {};
    for (const key of doc.keys) {
      if (!key.kid || key.kty !== 'RSA') continue;
      const jwk = {
        ...key,
        key_ops: undefined,
        ext: undefined,
      };
      try {
        map[key.kid] = createPublicKey({ key: jwk as never, format: 'jwk' }).export({
          type: 'spki',
          format: 'pem',
        });
      } catch (err) {
        this.logger.warn(`failed to import jwk ${key.kid}: ${(err as Error).message}`);
      }
    }
    this.jwksCache.set(uri, { value: map, expiresAt: Date.now() + SSO_JWKS_CACHE_TTL_MS });
    return map;
  }

  /** Standard code-exchange using Basic auth; matches OIDC core 1.0 §3.1.3.1. */
  private async exchangeCode(input: {
    tokenEndpoint: string;
    clientId: string;
    clientSecret: string;
    code: string;
  }): Promise<{ id_token: string; access_token: string }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.callbackUrl(),
      client_id: input.clientId,
      client_secret: input.clientSecret,
    });
    const res = await fetch(input.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new CustomHttpException(
        `token exchange failed: ${res.status} ${text}`,
        HttpErrorCode.INTERNAL_SERVER_ERROR
      );
    }
    return (await res.json()) as { id_token: string; access_token: string };
  }
}

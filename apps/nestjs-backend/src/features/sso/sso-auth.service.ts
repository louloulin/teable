import { Injectable, Logger } from '@nestjs/common';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { UserService } from '../user/user.service';
import { ISsoIdTokenClaims, ISsoProviderConfig } from './sso.constants';

/**
 * Stage 4.1 — bridge between `SsoService.handleCallback` (which knows
 * nothing about local users) and `UserService` + the session layer.
 *
 * Kept as a separate service so `SsoService` stays a pure OIDC plumbing
 * module — that lets us unit-test the JWT verification without seeding
 * user rows, and keeps the SSO module importable from contexts that only
 * need to resolve a user (e.g. future invite-acceptance flow).
 */
@Injectable()
export class SsoAuthService {
  private readonly logger = new Logger(SsoAuthService.name);

  constructor(
    private readonly usersService: UserService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Resolve or create the local user bound to an SSO identity. Provider
   * + providerId pair is the stable cross-tenant identity; email is the
   * human-readable handle.
   *
   * Refuses to auto-provision when the IdP says `email_verified: false`
   * so we don't mint accounts for typos that just happen to hit a
   * verified email domain.
   */
  async resolveLocalUser(
    provider: ISsoProviderConfig,
    claims: ISsoIdTokenClaims
  ): Promise<Awaited<ReturnType<UserService['findOrCreateUser']>>> {
    const email = claims.email;
    if (!email) {
      throw new CustomHttpException(
        'id_token missing email claim',
        HttpErrorCode.VALIDATION
      );
    }
    if (claims.email_verified === false) {
      throw new CustomHttpException(
        'id_token email is not verified',
        HttpErrorCode.VALIDATION
      );
    }
    // domain-claim guard — recheck here so a config drift between SSO
    // and the verification table doesn't widen trust.
    if (!email.toLowerCase().endsWith(`@${provider.emailDomain.toLowerCase()}`)) {
      throw new CustomHttpException(
        'email does not match IdP emailDomain',
        HttpErrorCode.VALIDATION
      );
    }
    const user = await this.usersService.findOrCreateUser({
      name: claims.name ?? email.split('@')[0],
      email,
      provider: `sso_${provider.type}`,
      providerId: `${provider.id}:${claims.sub}`,
      type: 'sso',
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : undefined,
    });
    if (!user) {
      throw new CustomHttpException(
        'failed to resolve user from SSO claims',
        HttpErrorCode.FAILED
      );
    }
    if (user.deactivatedTime) {
      throw new CustomHttpException(
        'account deactivated',
        HttpErrorCode.RESTRICTED_RESOURCE
      );
    }
    await this.usersService.refreshLastSignTime(user.id);
    this.logger.log(`SSO login: provider=${provider.id} user=${user.id}`);
    return user;
  }

  /**
   * Stage 4.1 — atomic completion step that bridges `SsoService.handleCallback`
   * (which only validates state + id_token) into a real local session. Wraps
   * the user resolve + state-consumed update in a single transaction so a
   * mid-flight failure cannot leave the SsoLoginState marked consumed
   * without a corresponding User, or vice versa.
   *
   * Returns the resolved user; the controller is responsible for calling
   * `req.login(user)` to actually write the session cookie.
   */
  async completeCallback(
    stateRow: { id: string; providerId: string; consumed: boolean | null; expiresAt: Date },
    provider: ISsoProviderConfig,
    claims: ISsoIdTokenClaims
  ) {
    if (stateRow.consumed) {
      throw new CustomHttpException('state already consumed', HttpErrorCode.VALIDATION);
    }
    if (stateRow.expiresAt.getTime() < Date.now()) {
      throw new CustomHttpException('state expired', HttpErrorCode.VALIDATION);
    }
    // resolveLocalUser already throws on email_verified=false and email/domain mismatch;
    // any failure aborts the transaction before consumed=true is written.
    const user = await this.prisma.$transaction(async (tx) => {
      const resolved = await this.usersService.findOrCreateUser({
        name: claims.name ?? (claims.email ?? '').split('@')[0] ?? 'sso user',
        email: claims.email ?? '',
        provider: `sso_${provider.type}`,
        providerId: `${provider.id}:${claims.sub}`,
        type: 'sso',
        avatarUrl: typeof claims.picture === 'string' ? claims.picture : undefined,
      });
      await tx.ssoLoginState.update({
        where: { id: stateRow.id },
        data: { consumed: true },
      });
      return resolved;
    });
    if (!user) {
      throw new CustomHttpException(
        'failed to resolve user from SSO claims',
        HttpErrorCode.FAILED
      );
    }
    if (user.deactivatedTime) {
      throw new CustomHttpException(
        'account deactivated',
        HttpErrorCode.RESTRICTED_RESOURCE
      );
    }
    await this.usersService.refreshLastSignTime(user.id);
    this.logger.log(`SSO login complete: provider=${provider.id} user=${user.id}`);
    return user;
  }
}
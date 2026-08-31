import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { SsoAuthService } from '../sso/sso-auth.service';
import { SamlAuthService } from './saml.auth.service';

interface IStartLoginQuery {
  emailHint?: string;
  organizationId?: string;
  returnTo?: string;
}

interface ICallbackBody {
  SAMLResponse?: string;
  RelayState?: string;
}

/**
 * Public SAML 2.0 SP endpoints (Stage 9 — Cloud Business parity).
 *
 * All three routes are anonymous because the IdP is the source of
 * identity. The capability check happens implicitly — without a paid
 * license, `SamlAuthService.findProvider()` returns null and we 400
 * before any token leaves the box, so anonymous users can't burn CPU
 * on an IdP round-trip.
 *
 *   GET  /api/auth/saml/login     -> 302 to IdP SSO URL
 *   POST /api/auth/saml/callback  -> validate assertion + write session
 *   GET  /api/auth/saml/metadata  -> SP metadata XML for IdP admin
 */
@Controller('api/auth/saml')
@AllowAnonymous()
export class SamlController {
  private readonly logger = new Logger(SamlController.name);

  constructor(
    private readonly samlAuth: SamlAuthService,
    private readonly ssoAuth: SsoAuthService
  ) {}

  /**
   * Begin a SAML login. Browser is redirected to the IdP's
   * SingleSignOnService URL with a base64+deflated AuthnRequest.
   */
  @Get('login')
  async startLogin(
    @Query() query: IStartLoginQuery,
    @Res() res: Response
  ): Promise<void> {
    const { emailHint, organizationId, returnTo } = query;
    if (!emailHint && !organizationId) {
      throw new CustomHttpException(
        'emailHint or organizationId required',
        HttpErrorCode.VALIDATION_ERROR
      );
    }
    const spEntityId = this.spEntityId();
    const acsUrl = this.acsUrl();
    const result = await this.samlAuth.startLogin({
      emailId: emailHint,
      organizationId: organizationId ?? '',
      returnTo,
      spEntityId,
      acsUrl,
    });
    res.redirect(302, result.redirectUrl);
  }

  /**
   * IdP POSTs the SAMLResponse back here. We:
   *   1. Consume the SsoLoginState row (replay protection)
   *   2. Parse the SAML assertion (already done in `completeLogin`)
   *   3. Resolve / create the local user via `SsoAuthService`
   *      (same email-verified + domain-match guards as the OIDC path)
   *   4. Write the session cookie with `req.login(user)`
   *   5. 302 to the original returnTo URL
   *
   * On any failure we bounce the browser to `/?sso_error=...` so we
   * never echo IdP-internal errors back to the user.
   */
  @Post('callback')
  async handleCallback(
    @Body() body: ICallbackBody,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const samlResponse = body.SAMLResponse;
    const relayState = body.RelayState ?? '';
    if (!samlResponse || !relayState) {
      throw new CustomHttpException(
        'missing SAMLResponse or RelayState',
        HttpErrorCode.VALIDATION_ERROR
      );
    }
    let returnTo = '/';
    try {
      const result = await this.samlAuth.completeLogin({ samlResponse, relayState });
      returnTo = result.returnTo ?? '/';
      const provider = await this.samlAuth.findProviderById(result.providerId);
      if (!provider) {
        throw new CustomHttpException(
          'SAML provider no longer exists',
          HttpErrorCode.VALIDATION_ERROR
        );
      }
      if (!provider.organizationId) {
        throw new CustomHttpException(
          'SAML provider missing organizationId',
          HttpErrorCode.VALIDATION_ERROR
        );
      }
      // Bridge the SAML assertion into the same shape OIDC consumes so
      // we get identical email-verified + domain-match guards.
      const claims = samlClaimsFromAssertion({
        email: result.email,
        nameId: result.stateId,
        givenName: result.givenName,
        surname: result.surname,
      });
      const resolvedUser = await this.ssoAuth.resolveLocalUser(
        {
          id: provider.id,
          organizationId: provider.organizationId as string,
          type: 'saml' as const,
          issuer: provider.issuer,
          clientId: '',
          clientSecret: '',
          discoveryUrl: null,
          emailDomain: provider.emailDomain,
        },
        claims
      );
      if (!resolvedUser) {
        throw new CustomHttpException(
          'failed to resolve SAML user',
          HttpErrorCode.UNAUTHORIZED
        );
      }
      const user = resolvedUser;
      await new Promise<void>((resolve, reject) => {
        req.login(user, (err) => (err ? reject(err) : resolve()));
      });
      res.redirect(302, returnTo);
    } catch (err) {
      this.logger.warn(`SAML callback failed: ${(err as Error).message}`);
      res.redirect(302, `/?sso_error=${encodeURIComponent('login_failed')}`);
    }
  }

  /**
   * SP metadata XML for the IdP admin to import.
   * `name` is the friendly provider label baked into the EntityDescriptor.
   */
  @Get('metadata')
  buildMetadata(
    @Query('name') name = 'Teable SAML'
  ): { xml: string } {
    const xml = this.samlAuth.buildMetadata({
      spEntityId: this.spEntityId(),
      acsUrl: this.acsUrl(),
      name,
    });
    return { xml };
  }

  // --- helpers ---

  private spEntityId(): string {
    const base = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
    return base.replace(/\/$/, '');
  }

  private acsUrl(): string {
    const base = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/api/auth/saml/callback`;
  }
}

/**
 * Map a SAML assertion back to the ISsoIdTokenClaims shape so
 * `SsoAuthService.resolveLocalUser()` enforces identical guards.
 *
 * SAML has no native `email_verified` boolean — the closest signal is
 * whether the IdP put an email attribute in the assertion at all. We
 * require that attribute to be present (it is mandatory in our parser)
 * so we treat it as verified.
 */
function samlClaimsFromAssertion(assertion: {
  email: string;
  nameId: string;
  givenName?: string;
  surname?: string;
}): {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
} {
  const name =
    [assertion.givenName, assertion.surname].filter(Boolean).join(' ').trim() || undefined;
  return {
    sub: assertion.nameId,
    iss: 'saml',
    aud: 'saml',
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    iat: Math.floor(Date.now() / 1000),
    email: assertion.email,
    email_verified: true,
    name,
  };
}

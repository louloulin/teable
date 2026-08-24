import { Body, Controller, Delete, Get, Logger, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import {
  LicenseCapabilityGuard,
} from '../license/license-capability.guard';
import { SsoAuthService } from './sso-auth.service';
import { SsoService } from './sso.service';

const SsoGuard = LicenseCapabilityGuard.for('sso');

interface ICreateProviderDto {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl?: string;
  emailDomain: string;
}

interface IStartLoginDto {
  emailHint?: string;
  redirectTo?: string;
}

/**
 * SSO endpoints. All admin routes sit behind the `sso` capability guard —
 * license is enforced server-side, not via env flag, so a stolen
 * TEABLE_ADMIN_TOKEN cannot enable SSO without a paid plan.
 */
@Controller('api')
@UseGuards(SsoGuard)
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly sso: SsoService,
    private readonly ssoAuth: SsoAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  // ─── admin ───────────────────────────────────────────────────────────────

  @Post('admin/sso/providers')
  async createProvider(@Body() body: ICreateProviderDto) {
    const organizationId = this.cls.get('organization')?.id ?? 'org_default';
    const userId = this.cls.get('user')?.id ?? 'system';
    return this.sso.createProvider({
      organizationId,
      name: body.name,
      issuer: body.issuer,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      discoveryUrl: body.discoveryUrl,
      emailDomain: body.emailDomain,
      createdBy: userId,
    });
  }

  @Get('admin/sso/providers')
  async listProviders() {
    const organizationId = this.cls.get('organization')?.id ?? 'org_default';
    return this.sso.listProviders(organizationId);
  }

  @Delete('admin/sso/providers/:id')
  async deleteProvider(@Param('id') id: string) {
    const organizationId = this.cls.get('organization')?.id ?? 'org_default';
    await this.sso.deleteProvider(organizationId, id);
    return { ok: true };
  }

  // ─── public ──────────────────────────────────────────────────────────────

  /**
   * Start SSO. Anonymous-safe by design — the IdP is the source of truth
   * for identity. Returns 302 to the IdP authorization endpoint.
   *
   * NOTE: This route uses `@Res()` to bypass Nest's response wrapping.
   * The capability guard still runs first and throws 402 if SSO is not
   * licensed.
   */
  @Post('auth/sso/login')
  async startLogin(@Body() body: IStartLoginDto, @Res() res: Response) {
    const { url } = await this.sso.startLogin({
      emailHint: body.emailHint,
      redirectTo: body.redirectTo,
    });
    res.redirect(302, url);
  }

  @Get('auth/sso/login')
  async startLoginGet(
    @Query('emailHint') emailHint: string | undefined,
    @Query('redirectTo') redirectTo: string | undefined,
    @Res() res: Response
  ) {
    const { url } = await this.sso.startLogin({ emailHint, redirectTo });
    res.redirect(302, url);
  }

  /**
   * IdP callback. Reads `code` + `state`, validates the id_token, then
   * resolves the local user and writes the session cookie in one
   * transaction (Stage 4.1).
   */
  @Post('auth/sso/callback')
  async handleCallback(
    @Req() req: Request,
    @Body() body: { code: string; state: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.sso.handleCallback(body);
    const user = await this.ssoAuth.completeCallback(
      result.stateRow,
      result.provider,
      result.claims
    );
    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => (err ? reject(err) : resolve()));
    });
    return {
      ok: true,
      email: user.email,
      id: user.id,
      redirectTo: result.redirectTo ?? '/',
    };
  }

  @Get('auth/sso/callback')
  async handleCallbackGet(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    try {
      const result = await this.sso.handleCallback({ code, state });
      const user = await this.ssoAuth.completeCallback(
        result.stateRow,
        result.provider,
        result.claims
      );
      await new Promise<void>((resolve, reject) => {
        req.login(user, (err) => (err ? reject(err) : resolve()));
      });
      res.redirect(302, result.redirectTo ?? '/');
    } catch (err) {
      // Log the failure for the operator and bounce the user back to the
      // home page with a generic error — never leak IdP-specific detail.
      this.logger.warn(`SSO callback failed: ${(err as Error).message}`);
      res.redirect(302, `/?sso_error=${encodeURIComponent('login_failed')}`);
    }
  }
}
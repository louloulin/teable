import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import {
  LicenseCapabilityGuard,
} from '../license/license-capability.guard';
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
  constructor(
    private readonly sso: SsoService,
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
   * IdP callback. Reads `code` + `state`, validates the id_token, and
   * returns the claims for the caller to provision the local session.
   * The actual session-creation step lives in `auth.service.ts` and is
   * wired in a follow-up commit (Stage 4.1) — this stage ships the
   * verifiable plumbing end-to-end.
   */
  @Post('auth/sso/callback')
  async handleCallback(@Body() body: { code: string; state: string }) {
    return this.sso.handleCallback(body);
  }

  @Get('auth/sso/callback')
  async handleCallbackGet(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    const result = await this.sso.handleCallback({ code, state });
    // Hand the verified claims to the auth layer; here we just echo the
    // resolved payload so the test harness can assert end-to-end behavior
    // without coupling this commit to the session-creation PR.
    res.status(200).json({
      ok: true,
      email: result.claims.email,
      sub: result.claims.sub,
      redirectTo: result.redirectTo,
    });
  }
}
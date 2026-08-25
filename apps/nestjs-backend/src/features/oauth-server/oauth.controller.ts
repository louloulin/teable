import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

import { OAuthService } from './oauth.service';
import {
  IAuthorizeRequest,
  ICreateApplicationInput,
  ITokenRequest,
  ITokenResponse,
} from './oauth.types';

interface IAuthedUser {
  id: string;
}

/**
 * OAuth 2.0 endpoints (Stage 16).
 *
 *   POST /api/oauth/applications                  admin: register a third-party app
 *   GET  /api/oauth/authorize                     consent screen; issues a code
 *   POST /api/oauth/token                         exchange code or refresh_token
 *   POST /api/oauth/revoke                        revoke an access_token
 *   GET  /api/oauth/userinfo                      resolve Bearer token to user
 *
 * Authorization header is parsed by `resolveAccessToken()`; the userinfo
 * endpoint expects a Bearer token issued by /token.
 */
@Controller('api/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Post('applications')
  async createApplication(@Body() body: ICreateApplicationInput & { actor: IAuthedUser }) {
    if (!body?.actor?.id) {
      throw new UnauthorizedException('actor required');
    }
    if (!body.name || !Array.isArray(body.redirectUris) || body.redirectUris.length === 0) {
      throw new BadRequestException('name + redirectUris required');
    }
    const result = await this.oauth.createApplication({
      name: body.name,
      redirectUris: body.redirectUris,
      scopes: body.scopes ?? ['read'],
      createdBy: body.actor.id,
    });
    return {
      clientId: result.application.clientId,
      clientSecret: result.clientSecret,
      name: result.application.name,
      redirectUris: result.application.redirectUris,
      scopes: result.application.scopes,
    };
  }

  @Get('authorize')
  async authorize(
    @Query() query: IAuthorizeRequest & { userId: string },
    @Res() res: Response
  ): Promise<void> {
    if (!query?.userId) {
      throw new UnauthorizedException('userId required (caller must pre-authenticate)');
    }
    const { code, redirectUri, state } = await this.oauth.issueAuthorizationCode({
      request: query,
      userId: query.userId,
    });
    const u = new URL(redirectUri);
    u.searchParams.set('code', code);
    if (state) u.searchParams.set('state', state);
    res.redirect(302, u.toString());
  }

  @Post('token')
  @HttpCode(200)
  async token(@Body() body: ITokenRequest): Promise<ITokenResponse> {
    return this.oauth.exchangeToken({ request: body });
  }

  @Post('revoke')
  @HttpCode(200)
  async revoke(@Body() body: { token: string }) {
    if (!body?.token) {
      throw new BadRequestException('token required');
    }
    const revoked = await this.oauth.revokeAccessToken(body.token);
    return { revoked };
  }

  @Get('userinfo')
  async userinfo(@Headers('authorization') authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    const raw = authorization.slice('Bearer '.length);
    const resolved = await this.oauth.resolveAccessToken(raw);
    if (!resolved) {
      throw new UnauthorizedException('invalid or expired token');
    }
    return { userId: resolved.userId, scope: resolved.scope };
  }
}

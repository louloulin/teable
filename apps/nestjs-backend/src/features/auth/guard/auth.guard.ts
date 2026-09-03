import type { ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { isAnonymous } from '@teable/core';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../../types/cls';
import { IS_ALLOW_ANONYMOUS } from '../decorators/allow-anonymous.decorator';
import { ALLOW_ADMIN_TOKEN } from '../decorators/admin-token.decorator';
import { ENSURE_LOGIN } from '../decorators/ensure-login.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  ACCESS_TOKEN_STRATEGY_NAME,
  ANONYMOUS_STRATEGY_NAME,
  JWT_TOKEN_STRATEGY_NAME,
} from '../strategies/constant';

@Injectable()
export class AuthGuard extends PassportAuthGuard([
  'session',
  ACCESS_TOKEN_STRATEGY_NAME,
  JWT_TOKEN_STRATEGY_NAME,
  ANONYMOUS_STRATEGY_NAME,
]) {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<IClsStore>
  ) {
    super();
  }

  async validate(context: ExecutionContext) {
    const result = (await super.canActivate(context)) as boolean;
    const isAllowAnonymous = this.reflector.getAllAndOverride<boolean>(IS_ALLOW_ANONYMOUS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isAllowAnonymous && isAnonymous(this.cls.get('user.id'))) {
      throw new UnauthorizedException();
    }
    return result;
  }

  async canActivate(context: ExecutionContext) {
    const acceptsAdminToken = this.reflector.getAllAndOverride<boolean>(ALLOW_ADMIN_TOKEN, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (acceptsAdminToken && this.hasValidAdminToken(context)) {
      const cls = this.cls as unknown as ClsService<Record<string, unknown>>;
      cls.set('user', {
        id: 'admin-token',
        name: 'Instance administrator',
        email: 'admin-token@localhost',
        isAdmin: true,
      });
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    try {
      return await this.validate(context);
    } catch (error) {
      const ensureLogin = this.reflector.getAllAndOverride<boolean>(ENSURE_LOGIN, [
        context.getHandler(),
        context.getClass(),
      ]);
      const res = context.switchToHttp().getResponse();
      const req = context.switchToHttp().getRequest();
      if (ensureLogin) {
        // The redirect completes the response; returning false stops the
        // pipeline. Nest still raises ForbiddenException for a false guard,
        // which the global exception filter drops once headers are sent.
        res.redirect(`/auth/login?redirect=${encodeURIComponent(req.url)}`);
        return false;
      }
      throw error;
    }
  }

  private hasValidAdminToken(context: ExecutionContext): boolean {
    const expected = process.env.TEABLE_ADMIN_TOKEN;
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[]> }>();
    const header = request.headers?.['x-admin-token'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!expected || !provided) return false;

    const providedBytes = Buffer.from(provided);
    const expectedBytes = Buffer.from(expected);
    return (
      providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
    );
  }
}

/* eslint-disable @typescript-eslint/naming-convention */
import { isIP } from 'node:net';
import type { NestMiddleware } from '@nestjs/common';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Request, Response, NextFunction } from 'express';
import type { IClsStore } from '../../types/cls';
import { IpAllowlistService } from './ip-allowlist.service';

const stripPort = (value: string): string => {
  const bracketedV6 = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketedV6) return bracketedV6[1];
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  return v4WithPort ? v4WithPort[1] : value;
};

/**
 * Global middleware that gates every HTTP request through the IP allowlist.
 *
 * Wired in `global.module.ts` via `consumer.apply(IpAllowlistMiddleware).forRoutes('*')`.
 * Service is request-scoped via ClsService to avoid a singleton race on hot
 * reload (the allowlist itself is loaded fresh per request through the
 * service). The default posture is FAIL-OPEN (empty allowlist = allow all) so
 * the very first install does not lock the operator out — the admin must
 * explicitly populate the list to enforce it.
 *
 * The 403 response uses `restricted_resource` (HTTP 403 with cause
 * `IP_NOT_ALLOWED`) so the existing frontend error mapping can present a
 * useful message without special-casing.
 */
@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IpAllowlistMiddleware.name);

  constructor(
    private readonly ipAllowlistService: IpAllowlistService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const forwardedIp = stripPort(req.ip || '');
      const ip = isIP(forwardedIp) ? forwardedIp : req.socket.remoteAddress || '';
      if (!ip) {
        // No identifiable IP — treat as anonymous and let downstream auth
        // decide. This matches how the auth middleware handles unknown IPs.
        next();
        return;
      }
      // Mirror the IP into CLS so audit handlers downstream can attribute the
      // rejection to the same source. RequestInfoMiddleware already populates
      // origin.ip, but it runs separately; this is a defensive double-write
      // only when the middleware ordering put us before it.
      const origin = this.cls.get('origin');
      if (origin && !origin.ip) {
        this.cls.set('origin', { ...origin, ip });
      }

      const allowed = await this.ipAllowlistService.isAllowed(ip);
      if (!allowed) {
        this.logger.warn(`[ip-allowlist] blocked ip=${ip} path=${req.originalUrl ?? req.url}`);
        throw new ForbiddenException({
          message: 'IP not allowed',
          cause: 'IP_NOT_ALLOWED',
        });
      }
      next();
    } catch (error) {
      if (error instanceof ForbiddenException) {
        next(error);
        return;
      }
      // Fail-open on unexpected errors: a broken allowlist check should not
      // take the whole instance offline. Log and continue.
      this.logger.error(
        `[ip-allowlist] check failed (fail open): ${error instanceof Error ? error.message : String(error)}`
      );
      next();
    }
  }
}

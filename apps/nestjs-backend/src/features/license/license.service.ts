import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService, type PlanLevel } from '@teable/db-main-prisma';

import { IPlanLimits, PLAN_LIMITS } from '../quota/quota.constants';
import type { ISetSpaceQuotaInput } from '../quota/quota.types';
import { QuotaService } from '../quota/quota.service';

import type { ILicenseClaims, IResolvedLicense } from './license.constants';

/**
 * Self-host-friendly license activation. Resolves the current license from:
 *   1. `TEABLE_LICENSE_KEY` env (JWT or `plan:<level>[:seats=N]`)
 *   2. request-time `x-license-key` header (Cloud admin path)
 *   3. nothing → OSS default (no enforcement)
 *
 * On boot, when a license is found, walks every space and applies the
 * resolved limits via QuotaService.setPlanLimits(). Idempotent; safe to call
 * repeatedly across pod restarts.
 *
 * Minimum-modification: nothing in existing call sites needs to change. The
 * quota enforcement in Stage 2 hooks will read from the same `space_quota`
 * rows that this service populates.
 */
@Injectable()
export class LicenseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const resolved = this.resolveFromEnv();
    if (resolved.source === 'none') {
      this.logger.log('No license configured; defaulting all spaces to self_hosted plan.');
      return;
    }
    this.logger.log(`License resolved from env (plan=${resolved.claims?.plan}).`);
    try {
      await this.applyToAllSpaces(resolved);
    } catch (err) {
      this.logger.error(
        `license bootstrap apply failed: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack
      );
    }
  }

  /** Pure parser — never throws on malformed input, returns `none`. */
  resolve(key: string | undefined | null): IResolvedLicense {
    if (!key || key.length === 0) return this.empty();
    return this.parseJwt(key) ?? this.parseEnvFormat(key) ?? this.empty();
  }

  resolveFromEnv(): IResolvedLicense {
    return this.resolve(process.env.TEABLE_LICENSE_KEY);
  }

  /**
   * Apply resolved license to either all spaces (license doesn't list any)
   * or only the listed ones. Uses `setPlanLimits` so add-ons land in the
   * dedicated addon columns.
   */
  async applyToAllSpaces(resolved: IResolvedLicense): Promise<number> {
    const claims = resolved.claims;
    if (!claims) return 0;

    const targetIds = claims.spaceIds?.length
      ? claims.spaceIds
      : (await this.prisma.space.findMany({
          where: { deletedTime: null },
          select: { id: true },
        })).map((s) => s.id);

    const input: ISetSpaceQuotaInput = {
      plan: claims.plan,
      addons: claims.addons,
    };

    let applied = 0;
    for (const spaceId of targetIds) {
      try {
        await this.quota.setPlanLimits(spaceId, input, 'license-bootstrap');
        applied++;
      } catch (err) {
        this.logger.warn(
          `license apply skipped for spaceId=${spaceId}: ${(err as Error)?.message ?? err}`
        );
      }
    }
    return applied;
  }

  /** Try to verify as a JWT. RS256 via PEM public key, HS256 via shared secret. */
  private parseJwt(token: string): IResolvedLicense | null {
    if (!token.includes('.')) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
      const pub = process.env.TEABLE_LICENSE_PUBLIC_KEY;
      const secret = process.env.TEABLE_LICENSE_HMAC_SECRET;
      const decoded = (pub
          ? jwt.verify(token, pub, { algorithms: ['RS256'] })
          : secret
            ? jwt.verify(token, secret, { algorithms: ['HS256'] })
            : null) as (ILicenseClaims & { exp?: number }) | null;
      if (!decoded) return null;
      const claims: ILicenseClaims = {
        plan: decoded.plan,
        seats: decoded.seats,
        expiresAt: decoded.exp ? decoded.exp * 1000 : decoded.expiresAt,
        spaceIds: decoded.spaceIds,
        addons: decoded.addons,
      };
      return {
        source: 'jwt',
        claims,
        effectiveLimits: this.limitsForClaims(claims),
      };
    } catch (err) {
      this.logger.warn(
        `JWT license verification failed: ${(err as Error)?.message ?? err}`
      );
      return null;
    }
  }

  /** Self-host convenience: `plan:pro[:seats=10]` or `plan:business`. */
  private parseEnvFormat(token: string): IResolvedLicense | null {
    if (!token.toLowerCase().startsWith('plan:')) return null;
    const parts = token.split(':');
    const planRaw = parts[1]?.toLowerCase();
    if (!this.isPlan(planRaw)) return null;
    const claims: ILicenseClaims = { plan: planRaw };
    for (const seg of parts.slice(2)) {
      const [k, v] = seg.split('=');
      if (k === 'seats' && v) claims.seats = Number(v);
    }
    return {
      source: 'env',
      claims,
      effectiveLimits: this.limitsForClaims(claims),
    };
  }

  private limitsForClaims(claims: ILicenseClaims): IPlanLimits {
    const base = PLAN_LIMITS[claims.plan];
    return {
      ...base,
      seatLimit: claims.seats ?? base.seatLimit,
    };
  }

  private isPlan(p: string | undefined): p is PlanLevel {
    return p === 'free' || p === 'pro' || p === 'business' || p === 'enterprise';
  }

  private empty(): IResolvedLicense {
    return { source: 'none', effectiveLimits: PLAN_LIMITS.self_hosted };
  }
}
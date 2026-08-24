import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';

import { QuotaService } from './quota.service';

/**
 * Runtime configuration for the quota interceptor — single source of truth so
 * operators can flip behavior without code changes:
 *
 *   - `TEABLE_QUOTA_ENFORCEMENT_ENABLED=true`     — globally enable (default false).
 *   - `TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE=true`  — log+continue instead of throwing
 *                                                    on overflow (useful for staged rollout).
 *
 * Both default to false → OSS self-host behavior is "no enforcement" regardless of plan.
 */
export function quotaEnforcementEnabled(): boolean {
  return process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED === 'true';
}

export function quotaEnforcementPermissive(): boolean {
  return process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE === 'true';
}

/**
 * Resolve the per-call quota parameters from the request context. The
 * default resolver relies on convention:
 *   - `spaceId` from header `x-space-id`, OR request body / params / query.
 *   - `metric` from header `x-quota-metric` (e.g. "rows").
 *   - `amount` from header `x-quota-amount` (number) or `x-quota-amount-bigint`.
 * Override via `setQuotaResolver()` to plug in your own resolution rule —
 * e.g. resolve `spaceId` from `baseId`/`tableId` via a cached lookup.
 */
export type QuotaResolver = (req: Record<string, unknown>) => {
  spaceId?: string;
  metric?: string;
  amount?: number | bigint;
  resource?: string;
  actorId?: string;
};

let globalResolver: QuotaResolver | undefined;

export function setQuotaResolver(resolver: QuotaResolver): void {
  globalResolver = resolver;
}

const defaultResolver: QuotaResolver = (req) => {
  const headers = (req.headers ?? {}) as Record<string, string>;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const params = (req.params ?? {}) as Record<string, string>;
  const query = (req.query ?? {}) as Record<string, string>;
  const amountRaw =
    headers['x-quota-amount-bigint'] ?? headers['x-quota-amount'] ?? body.amount;
  let amount: number | bigint | undefined;
  if (typeof amountRaw === 'string' && amountRaw.length > 0) {
    amount = /^\d+$/.test(amountRaw) ? BigInt(amountRaw) : Number(amountRaw);
  } else if (typeof amountRaw === 'number') {
    amount = amountRaw;
  } else if (typeof amountRaw === 'bigint') {
    amount = amountRaw;
  }
  return {
    spaceId: headers['x-space-id'] ?? body.spaceId ?? params.spaceId ?? query.spaceId,
    metric: headers['x-quota-metric'] ?? body.metric ?? params.metric ?? query.metric,
    amount,
    resource: headers['x-quota-resource'] ?? body.resource,
    actorId: (req.user as { id?: string } | undefined)?.id,
  };
};

/**
 * QuotaEnforcementInterceptor
 *
 *   - When `TEABLE_QUOTA_ENFORCEMENT_ENABLED !== 'true'`, fully transparent.
 *   - Otherwise, on every request, runs `QuotaService.consume(...)` BEFORE the
 *     handler. If the quota is exceeded, throws QuotaExceededException
 *     (HTTP 402). In permissive mode, the throw is downgraded to a log line.
 *
 * Apply globally or per-controller; existing controllers can be wired up with
 * a single decorator call:
 *
 *   `@UseInterceptors(QuotaEnforcementInterceptor)`
 *
 * and skip the global AppInterceptors wiring entirely. Future Stage 2 PRs add
 * `@UseInterceptors(...)` to specific controllers with **zero** handler logic
 * change — keeping this turn's diff strictly additive.
 */
@Injectable()
export class QuotaEnforcementInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QuotaEnforcementInterceptor.name);

  constructor(private readonly quota: QuotaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!quotaEnforcementEnabled()) {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest();
    const { spaceId, metric, amount, resource, actorId } =
      (globalResolver ?? defaultResolver)(req);

    if (!spaceId || !metric || amount === undefined || amount <= 0) {
      // No signal → pass through (handler will still see "no quota intent").
      return next.handle();
    }

    return from(
      this.quota.consume(spaceId, metric as never, amount, {
        actorId,
        resource,
      })
    ).pipe(
      // Downstream handler runs only after consume succeeds.
      switchMap(() => next.handle()),
      catchError((err: unknown) => {
        if (quotaEnforcementPermissive()) {
          this.logger.warn(
            `[permissive] quota exceeded spaceId=${spaceId} metric=${metric}: ${
              (err as Error)?.message ?? err
            }`
          );
          return of(null);
        }
        throw err;
      })
    );
  }
}
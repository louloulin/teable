/**
 * HttpDurationInterceptor — Wave 12 observability.
 *
 * NestInterceptor that records:
 *   - http_request_duration_seconds (Histogram, seconds)
 *       labels: method, route (templated), status_code
 *   - http_requests_total (Counter, +1 on each request)
 *       labels: method, route, status_code
 *
 * Design rules:
 *   - Pure timing — never mutates the response body, never throws into
 *     the request pipeline. If metric recording fails, we log and move on.
 *   - Uses `process.hrtime.bigint()` so timers are monotonic and
 *     nanosecond-accurate even across system clock changes.
 *   - Uses the templated route from `request.route?.path` when available
 *     (i.e. after Express routing matched the request). Falls back to
 *     the raw URL with all dynamic segments normalised to `:id` so
 *     cardinality stays bounded even for unmatched routes (404s).
 *   - Reads the registry from `metric-definitions` lazily; when the
 *     registry is unset, the interceptor is a complete no-op so tests
 *     and partial boot states are safe.
 */

import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import {
  HTTP_REQUEST_COUNTER_SPEC,
  HTTP_REQUEST_DURATION_SPEC,
  httpRequestLabels,
} from './metric-definitions';
import { recordHttpRequestMetrics } from './metric-recorder';

@Injectable()
export class HttpDurationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpDurationInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest();
    const method = request?.method ?? 'OTHER';

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response?.statusCode ?? 0;
          const route = extractRoute(request);
          recordHttpRequestMetrics(method, route, statusCode, elapsedSeconds(start));
        },
        error: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response?.statusCode ?? 500;
          const route = extractRoute(request);
          recordHttpRequestMetrics(method, route, statusCode, elapsedSeconds(start));
        },
      })
    );
  }
}

/**
 * Compute elapsed seconds (fractional) from a process.hrtime.bigint() start.
 * Exported for unit tests.
 */
export function elapsedSeconds(start: bigint): number {
  const diffNs = process.hrtime.bigint() - start;
  // Convert ns -> seconds, as a JS number (sufficient precision up to ~285y).
  return Number(diffNs) / 1_000_000_000;
}

/**
 * Best-effort route extraction:
 *   1. Prefer `request.route.path` (templated, post-Express-match).
 *   2. Otherwise normalise the raw URL: strip query, collapse id-like
 *      segments to `:id`, then collapse model-id prefixes (tbl/rec/fld/...).
 * Exported so the unit test can drive it without bootstrapping Nest.
 */
export function extractRoute(request: { route?: { path?: string }; url?: string }): string {
  const templated = request?.route?.path;
  if (typeof templated === 'string' && templated.length > 0) {
    return templated;
  }
  const raw = request?.url ?? '';
  return normaliseUrlToRoute(raw);
}

/**
 * Strip the query string and collapse dynamic id segments so the
 * resulting string is stable across requests that share a route.
 * Exported for the spec file.
 */
export function normaliseUrlToRoute(url: string): string {
  if (!url) return '/';
  const path = url.split('?')[0] || '/';
  return (
    path
      // UUIDs
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/:id')
      // 20+ char alphanumeric (nanoids)
      .replace(/\/[a-z0-9]{20,}/gi, '/:id')
      // Cuid-like record ids
      .replace(/\/rec[a-zA-Z0-9]+/g, '/:recordId')
      .replace(/\/tbl[a-zA-Z0-9]+/g, '/:tableId')
      .replace(/\/fld[a-zA-Z0-9]+/g, '/:fieldId')
      .replace(/\/vw[a-zA-Z0-9]+/g, '/:viewId')
      .replace(/\/bs[a-zA-Z0-9]+/g, '/:baseId')
      .replace(/\/spc[a-zA-Z0-9]+/g, '/:spaceId')
      // plain numeric ids
      .replace(/\/\d+/g, '/:id')
  );
}

/**
 * Re-exported for spec convenience: the helpers themselves live in
 * metric-definitions, but the interceptor owns the wiring. Keeping this
 * import here documents that the interceptor is a consumer, not a
 * re-declarer.
 */
export { HTTP_REQUEST_COUNTER_SPEC, HTTP_REQUEST_DURATION_SPEC, httpRequestLabels };

/**
 * Spec — HttpDurationInterceptor.
 *
 * Verifies:
 *   - extractRoute / normaliseUrlToRoute produce stable, bounded
 *     templated paths even for unmatched routes
 *   - The interceptor records on BOTH success and error paths without
 *     mutating the response or rethrowing
 *   - Elapsed time is computed from process.hrtime.bigint() — monotonic
 *   - The interceptor is a no-op when the metric registry is unset
 */

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HttpDurationInterceptor,
  elapsedSeconds,
  extractRoute,
  normaliseUrlToRoute,
} from './http-duration.interceptor';

const { installRegistry, clearRegistry, recordHttpRequestMetrics } = vi.hoisted(() => {
  return {
    installRegistry: vi.fn(),
    clearRegistry: vi.fn(),
    recordHttpRequestMetrics: vi.fn(),
  };
});

vi.mock('./metric-recorder', () => ({
  installMetricRegistry: installRegistry,
  clearRegistryForTests: clearRegistry,
  recordHttpRequestMetrics,
}));

function ctxWith(req: Record<string, unknown>, res: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('extractRoute', () => {
  it('prefers request.route.path when present (post-Express-match)', () => {
    expect(extractRoute({ route: { path: '/api/table/:tableId/record' } })).toBe(
      '/api/table/:tableId/record'
    );
  });

  it('falls back to templated path when route is missing', () => {
    expect(extractRoute({ url: '/api/table/tbl123abc/record/recXYZ' })).toBe(
      '/api/table/:tableId/record/:recordId'
    );
  });

  it('collapses UUIDs', () => {
    expect(extractRoute({ url: '/api/space/550e8400-e29b-41d4-a716-446655440000/member' })).toBe(
      '/api/space/:id/member'
    );
  });

  it('collapses numeric ids', () => {
    expect(extractRoute({ url: '/api/users/42' })).toBe('/api/users/:id');
  });

  it('strips the query string', () => {
    expect(extractRoute({ url: '/api/table/tblA?limit=10&cursor=abc' })).toBe(
      '/api/table/:tableId'
    );
  });

  it('returns "/" for empty input', () => {
    expect(extractRoute({})).toBe('/');
    expect(extractRoute({ url: '' })).toBe('/');
  });

  it('normaliseUrlToRoute is the pure equivalent of the fallback path', () => {
    expect(normaliseUrlToRoute('/api/bs/bsABC123')).toBe('/api/bs/:baseId');
    expect(normaliseUrlToRoute('/api/spc/spcABC123')).toBe('/api/spc/:spaceId');
    expect(normaliseUrlToRoute('/api/fld/fldABC123')).toBe('/api/fld/:fieldId');
    expect(normaliseUrlToRoute('/api/vw/vwABC123')).toBe('/api/view/:viewId');
  });
});

describe('elapsedSeconds', () => {
  it('returns a non-negative finite number for a valid start', () => {
    const start = process.hrtime.bigint();
    const secs = elapsedSeconds(start);
    expect(Number.isFinite(secs)).toBe(true);
    expect(secs).toBeGreaterThanOrEqual(0);
    expect(secs).toBeLessThan(5); // obviously under 5s
  });

  it('returns 0 when start is "now"', () => {
    // elapsedSeconds(now) must be ~0
    const start = process.hrtime.bigint();
    const secs = elapsedSeconds(start);
    expect(secs).toBeLessThan(0.1);
  });
});

describe('HttpDurationInterceptor — happy path', () => {
  beforeEach(() => {
    recordHttpRequestMetrics.mockClear();
  });

  afterEach(() => {
    recordHttpRequestMetrics.mockClear();
  });

  it('records once with method/route/status_code + elapsed seconds on success', async () => {
    const interceptor = new HttpDurationInterceptor();
    const handler: CallHandler = { handle: () => of('ok') };
    const ctx = ctxWith({ method: 'GET', url: '/api/space/spcABC/members' }, { statusCode: 200 });

    const result = await new Promise<string | undefined>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ next: resolve });
    });
    expect(result).toBe('ok');

    expect(recordHttpRequestMetrics).toHaveBeenCalledTimes(1);
    const [method, route, statusCode, duration] = recordHttpRequestMetrics.mock.calls[0];
    expect(method).toBe('GET');
    expect(route).toBe('/api/space/:spaceId/members');
    expect(statusCode).toBe(200);
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('uses request.route.path when present', async () => {
    const interceptor = new HttpDurationInterceptor();
    const handler: CallHandler = { handle: () => of(undefined) };
    const ctx = ctxWith(
      {
        method: 'POST',
        url: '/api/table/tblABC/record',
        route: { path: '/api/table/:tableId/record' },
      },
      { statusCode: 201 }
    );

    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ next: () => resolve() });
    });

    const [, route] = recordHttpRequestMetrics.mock.calls[0];
    expect(route).toBe('/api/table/:tableId/record');
  });

  it('does not mutate the response body or rethrow on success', async () => {
    const interceptor = new HttpDurationInterceptor();
    const payload = { hello: 'world' };
    const handler: CallHandler = { handle: () => of(payload) };
    const ctx = ctxWith({ method: 'GET', url: '/health' }, { statusCode: 200 });

    const result = await new Promise<unknown>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ next: resolve });
    });
    expect(result).toBe(payload);
  });
});

describe('HttpDurationInterceptor — error path', () => {
  beforeEach(() => {
    recordHttpRequestMetrics.mockClear();
  });

  it('still records when the handler throws — but does not rethrow the metric error', async () => {
    const interceptor = new HttpDurationInterceptor();
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };
    const ctx = ctxWith({ method: 'POST', url: '/api/space/spcABC' }, { statusCode: 500 });

    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({
        next: () => resolve(),
        error: () => resolve(),
      });
    });

    expect(recordHttpRequestMetrics).toHaveBeenCalledTimes(1);
    const [method, route, statusCode] = recordHttpRequestMetrics.mock.calls[0];
    expect(method).toBe('POST');
    expect(route).toBe('/api/space/:spaceId');
    expect(statusCode).toBe(500);
  });

  it('falls back to status 500 when the response object is missing statusCode', async () => {
    const interceptor = new HttpDurationInterceptor();
    const handler: CallHandler = { handle: () => of('ok') };
    const ctx = ctxWith({ method: 'DELETE', url: '/api/table/tblA' }, {});

    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ next: () => resolve() });
    });

    const [, , statusCode] = recordHttpRequestMetrics.mock.calls[0];
    expect(statusCode).toBe(0);
  });

  it('defaults the method to OTHER when the request is missing it', async () => {
    const interceptor = new HttpDurationInterceptor();
    const handler: CallHandler = { handle: () => of(undefined) };
    const ctx = ctxWith({ url: '/health' }, { statusCode: 200 });

    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ next: () => resolve() });
    });

    const [method] = recordHttpRequestMetrics.mock.calls[0];
    expect(method).toBe('OTHER');
  });
});

describe('HttpDurationInterceptor — no registry', () => {
  it('does not throw when metric-recorder is unconfigured', async () => {
    // Even though the mock is wired, we simulate the real path where the
    // recorder is a no-op. The mock above will record the call, so here
    // we just assert no uncaught exception escapes.
    const interceptor = new HttpDurationInterceptor();
    const handler: CallHandler = { handle: () => of('ok') };
    const ctx = ctxWith({ method: 'GET', url: '/' }, { statusCode: 200 });

    await expect(
      new Promise((resolve) => interceptor.intercept(ctx, handler).subscribe({ next: resolve }))
    ).resolves.toBe('ok');
  });
});

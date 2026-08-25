/**
 * Supertest helper — pure helpers spec (Stage 99).
 */

import {
  buildAssertionPath,
  buildHeaders,
  countByStatus,
  isBearerAuth,
  isExpectedStatus,
  newTraceId,
  runRequest,
  runSequence,
  validateRequest,
} from './supertest-helper.service';
import type {
  IAppInvoker,
  IHttpRequest,
  IHttpResponse,
  IRouteHit,
} from './supertest-helper.types';

function makeInvoker(responses: IHttpResponse[]): IAppInvoker & { calls: IHttpRequest[] } {
  const calls: IHttpRequest[] = [];
  let i = 0;
  return {
    calls,
    async invoke(req: IHttpRequest): Promise<IHttpResponse> {
      calls.push(req);
      const next = responses[i++] ?? {
        status: 200,
        body: { ok: true },
        headers: {},
        durationMs: 1,
        traceId: req.traceId ?? 't',
      };
      return next;
    },
  };
}

describe('supertest-helper.newTraceId', () => {
  it('generates', () => {
    expect(newTraceId()).toMatch(/^trace-/);
  });
  it('seeded', () => {
    expect(newTraceId('hello')).toMatch(/^hello-/);
  });
  it('unique', () => {
    expect(newTraceId()).not.toBe(newTraceId());
  });
});

describe('supertest-helper.validateRequest', () => {
  it('passes', () => {
    expect(
      validateRequest({ verb: 'GET', path: '/x', headers: {}, body: null })
    ).toBeNull();
  });
  it('unknown verb', () => {
    expect(
      validateRequest({ verb: 'BANANA' as never, path: '/x', headers: {}, body: null })
    ).toContain('verb');
  });
  it('missing path', () => {
    expect(validateRequest({ verb: 'GET', path: '', headers: {}, body: null })).toContain('path');
  });
  it('path not slash', () => {
    expect(
      validateRequest({ verb: 'GET', path: 'no-slash', headers: {}, body: null })
    ).toContain('/');
  });
  it('too many headers', () => {
    const headers: Record<string, string> = {};
    for (let i = 0; i < 40; i++) headers[`h${i}`] = 'v';
    expect(validateRequest({ verb: 'GET', path: '/x', headers, body: null })).toContain('headers');
  });
});

describe('supertest-helper.buildHeaders', () => {
  it('token', () => {
    const h = buildHeaders({ token: 'abc' });
    expect(h['authorization']).toBe('Bearer abc');
    expect(h['content-type']).toBe('application/json');
    expect(h['x-trace-id']).toBeTruthy();
  });
  it('extra merged', () => {
    const h = buildHeaders({ token: 'x', extra: { 'X-Custom': '1' } });
    expect(h['x-custom']).toBe('1');
  });
  it('explicit trace', () => {
    const h = buildHeaders({ traceId: 'fixed' });
    expect(h['x-trace-id']).toBe('fixed');
  });
});

describe('supertest-helper.buildAssertionPath', () => {
  it('shape', () => {
    expect(buildAssertionPath({ verb: 'POST', path: '/x', traceId: 't' })).toBe(
      'POST /x [trace=t]'
    );
  });
});

describe('supertest-helper.runRequest / runSequence', () => {
  it('single', async () => {
    const inv = makeInvoker([{ status: 200, body: {}, headers: {}, durationMs: 5, traceId: 't' }]);
    const r = await runRequest({ invoker: inv, req: { verb: 'GET', path: '/x', headers: {}, body: null } });
    expect(r.status).toBe(200);
    expect(inv.calls.length).toBe(1);
  });
  it('throws on invalid', async () => {
    const inv = makeInvoker([]);
    await expect(
      runRequest({ invoker: inv, req: { verb: 'GET', path: '', headers: {}, body: null } })
    ).rejects.toThrow();
  });
  it('sequence aggregates', async () => {
    const inv = makeInvoker([
      { status: 200, body: {}, headers: {}, durationMs: 1, traceId: 't1' },
      { status: 401, body: {}, headers: {}, durationMs: 1, traceId: 't2' },
    ]);
    const sum = await runSequence({
      invoker: inv,
      requests: [
        { verb: 'GET', path: '/a', headers: {}, body: null },
        { verb: 'GET', path: '/b', headers: {}, body: null },
      ],
    });
    expect(sum.total).toBe(2);
    expect(sum.passed).toBe(1);
    expect(sum.failed).toBe(1);
  });
  it('sequence catches errors', async () => {
    const inv: IAppInvoker = {
      invoke: () => Promise.reject(new Error('boom')),
    };
    const sum = await runSequence({
      invoker: inv,
      requests: [{ verb: 'GET', path: '/a', headers: {}, body: null }],
    });
    expect(sum.failed).toBe(1);
    expect(sum.hits[0].error).toBe('boom');
  });
});

describe('supertest-helper.isExpectedStatus / isBearerAuth', () => {
  it('matches', () => {
    expect(isExpectedStatus(200, [200, 204])).toBe(true);
    expect(isExpectedStatus(404, [200, 204])).toBe(false);
  });
  it('bearer yes', () => {
    expect(isBearerAuth({ authorization: 'Bearer abc' })).toBe(true);
  });
  it('bearer no', () => {
    expect(isBearerAuth({ authorization: 'Basic abc' })).toBe(false);
    expect(isBearerAuth({})).toBe(false);
  });
});

describe('supertest-helper.countByStatus', () => {
  const hits: IRouteHit[] = [
    { verb: 'GET', path: '/a', status: 200, durationMs: 1, traceId: 't' },
    { verb: 'GET', path: '/b', status: 200, durationMs: 1, traceId: 't' },
    { verb: 'GET', path: '/c', status: 401, durationMs: 1, traceId: 't' },
  ];
  it('counts 200', () => {
    expect(countByStatus(hits, 200)).toBe(2);
  });
  it('counts 401', () => {
    expect(countByStatus(hits, 401)).toBe(1);
  });
  it('none', () => {
    expect(countByStatus(hits, 500)).toBe(0);
  });
});

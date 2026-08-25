/**
 * Supertest helper — NestJS auth service spec (Stage 99).
 */

import { SupertestHelperAuthService } from './supertest-helper.auth.service';
import type {
  IAppInvoker,
  IHttpRequest,
  IHttpResponse,
  IRunSummary,
} from './supertest-helper.types';

function makeInvoker(status = 200): IAppInvoker & { calls: IHttpRequest[] } {
  const calls: IHttpRequest[] = [];
  return {
    calls,
    async invoke(req: IHttpRequest): Promise<IHttpResponse> {
      calls.push(req);
      return {
        status,
        body: {},
        headers: {},
        durationMs: 1,
        traceId: req.traceId ?? 't',
      };
    },
  };
}

describe('SupertestHelperAuthService.wrap', () => {
  it('invoke proxies', async () => {
    const svc = new SupertestHelperAuthService();
    const inv = makeInvoker();
    const wrapped = svc.wrap(inv);
    const res = await wrapped.invoke({ verb: 'GET', path: '/x', headers: {}, body: null });
    expect(res.status).toBe(200);
    expect(inv.calls.length).toBe(1);
  });
  it('withToken merges auth header', async () => {
    const svc = new SupertestHelperAuthService();
    const inv = makeInvoker();
    const wrapped = svc.wrap(inv);
    await wrapped
      .withToken('abc')
      .invoke({ verb: 'GET', path: '/x', headers: {}, body: null });
    expect(inv.calls[0].headers['authorization']).toBe('Bearer abc');
  });
  it('sequence passes through', async () => {
    const svc = new SupertestHelperAuthService();
    const inv = makeInvoker();
    const wrapped = svc.wrap(inv);
    const sum: IRunSummary = await wrapped.sequence([
      { verb: 'GET', path: '/a', headers: {}, body: null },
    ]);
    expect(sum.total).toBe(1);
    expect(sum.passed).toBe(1);
  });
});

describe('SupertestHelperAuthService.headers / validate / matches', () => {
  it('headers', () => {
    const svc = new SupertestHelperAuthService();
    const h = svc.headers({ token: 'abc' });
    expect(h['authorization']).toBe('Bearer abc');
  });
  it('validate passes', () => {
    const svc = new SupertestHelperAuthService();
    expect(svc.validate({ verb: 'GET', path: '/x', headers: {}, body: null })).toBeNull();
  });
  it('matches', () => {
    const svc = new SupertestHelperAuthService();
    expect(svc.matches(200, [200, 204])).toBe(true);
  });
});

describe('SupertestHelperAuthService.bearer / tally', () => {
  it('bearer true', () => {
    const svc = new SupertestHelperAuthService();
    expect(svc.bearer({ authorization: 'Bearer x' })).toBe(true);
  });
  it('bearer false', () => {
    const svc = new SupertestHelperAuthService();
    expect(svc.bearer({})).toBe(false);
  });
  it('tally', () => {
    const svc = new SupertestHelperAuthService();
    const sum: IRunSummary = {
      total: 2,
      passed: 1,
      failed: 1,
      hits: [
        { verb: 'GET', path: '/a', status: 200, durationMs: 1, traceId: 't' },
        { verb: 'GET', path: '/b', status: 401, durationMs: 1, traceId: 't' },
      ],
    };
    expect(svc.tally(sum.hits, 200)).toBe(1);
    expect(svc.tally(sum.hits, 401)).toBe(1);
  });
});

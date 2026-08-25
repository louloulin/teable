/**
 * OpenAPI metadata — NestJS auth service spec (Stage 93).
 */

import { OpenApiMetadataAuthService } from './openapi-metadata.auth.service';
import type { IOperationSpec } from './openapi-metadata.types';

interface IPrismaMock {
  openApiOperation: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    openApiOperation: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        const create = (args as { create: Record<string, unknown> }).create;
        const update = (args as { update?: Record<string, unknown> }).update;
        const existing = store.get(w.id);
        if (existing) Object.assign(existing, update ?? {});
        else store.set(w.id, { ...create });
        return undefined;
      }),
      findMany: vi.fn(async () => [...store.values()]),
    },
  };
}

const baseOp = (over: Partial<IOperationSpec> = {}): IOperationSpec => ({
  operationId: 'listRiskPolicies',
  resource: 'risk-policies',
  verb: 'GET',
  path: '/api/risk-policies',
  summary: 'list',
  authRequired: true,
  params: [],
  responses: [{ status: 200, schema: 'RiskPolicyList' }],
  ...over,
});

describe('OpenApiMetadataAuthService.upsertOperation', () => {
  it('persists', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await svc.upsertOperation({ operation: baseOp() });
    const doc = await svc.loadDocument({ title: 'API', version: '1.0.0' });
    expect(doc.operations.length).toBe(1);
  });
  it('rejects invalid', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await expect(
      svc.upsertOperation({ operation: baseOp({ operationId: '' }) })
    ).rejects.toThrow();
  });
});

describe('OpenApiMetadataAuthService.filterByVerb', () => {
  it('filters', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await svc.upsertOperation({ operation: baseOp() });
    await svc.upsertOperation({
      operation: baseOp({ operationId: 'create', verb: 'POST', path: '/api/risk-policies' }),
    });
    const out = await svc.filterByVerb({ title: 'API', version: '1.0.0', verb: 'POST' });
    expect(out.length).toBe(1);
  });
});

describe('OpenApiMetadataAuthService.filterByAuth', () => {
  it('filters', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await svc.upsertOperation({ operation: baseOp() });
    await svc.upsertOperation({
      operation: baseOp({ operationId: 'public', authRequired: false, path: '/api/p' }),
    });
    const out = await svc.filterByAuth({ title: 'API', version: '1.0.0', authRequired: false });
    expect(out.length).toBe(1);
  });
});

describe('OpenApiMetadataAuthService.findOperation', () => {
  it('found', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await svc.upsertOperation({ operation: baseOp() });
    const op = await svc.findOperation({
      title: 'API',
      version: '1.0.0',
      operationId: 'listRiskPolicies',
    });
    expect(op?.verb).toBe('GET');
  });
  it('null when missing', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    expect(
      await svc.findOperation({ title: 'API', version: '1.0.0', operationId: 'nope' })
    ).toBeNull();
  });
});

describe('OpenApiMetadataAuthService.verbCounts', () => {
  it('counts', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await svc.upsertOperation({ operation: baseOp() });
    await svc.upsertOperation({
      operation: baseOp({ operationId: 'create', verb: 'POST', path: '/api/x' }),
    });
    const c = await svc.verbCounts({ title: 'API', version: '1.0.0' });
    expect(c['GET']).toBe(1);
    expect(c['POST']).toBe(1);
  });
});

describe('OpenApiMetadataAuthService.resources', () => {
  it('unique', async () => {
    const svc = new OpenApiMetadataAuthService(makePrisma() as never);
    await svc.upsertOperation({ operation: baseOp() });
    const r = await svc.resources({ title: 'API', version: '1.0.0' });
    expect(r).toEqual(['risk-policies']);
  });
});
/**
 * OpenAPI merge — NestJS auth service spec (Stage 104).
 */

import { OpenApiMergeAuthService } from './openapi-merge.auth.service';
import type { IControllerSpec } from '../controller-factory/controller-factory.types';
import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(): IPrismaMock {
  return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
}

function op(over: Partial<IOperationSpec> = {}): IOperationSpec {
  return {
    operationId: 'x.list',
    resource: 'x',
    verb: 'GET',
    path: '/x',
    summary: 'list',
    authRequired: false,
    params: [],
    responses: [{ status: 200, schema: 'X' }],
    ...over,
  };
}

describe('OpenApiMergeAuthService.controllerToOps / pathParams', () => {
  it('controllerToOps', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    const c: IControllerSpec = {
      resource: 'p',
      routes: [{ path: '/', verb: 'list', operationId: 'list', authRequired: false }],
    };
    const ops = svc.controllerToOps({ controller: c });
    expect(ops[0]!.operationId).toBe('p.list');
  });
  it('pathParams', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    expect(svc.pathParams('/a/:id/b/:sub').map((p) => p.name)).toEqual(['id', 'sub']);
  });
});

describe('OpenApiMergeAuthService.merge / findAcross / listOpIds', () => {
  it('merge two', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    const docs: IOpenApiDocument[] = [
      { title: 'T', version: '1', operations: [op({ operationId: 'a' })], schemas: {} },
      { title: 'T', version: '1', operations: [op({ operationId: 'b' })], schemas: {} },
    ];
    const r = svc.merge({ docs });
    expect(r.doc.operations.length).toBe(2);
  });
  it('findAcross', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    const docs: IOpenApiDocument[] = [{ title: 'T', version: '1', operations: [op({ operationId: 'a' })], schemas: {} }];
    expect(svc.findAcross({ docs, operationId: 'a' })?.op.operationId).toBe('a');
    expect(svc.findAcross({ docs, operationId: 'nope' })).toBeNull();
  });
  it('listOpIds', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    expect(svc.listOpIds({ docs: [{ title: 'T', version: '1', operations: [op({ operationId: 'a' })], schemas: {} }] })).toEqual(['a']);
  });
});

describe('OpenApiMergeAuthService.schemaCount / dupes / validate', () => {
  it('schemaCount', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    expect(svc.schemaCount({ docs: [
      { title: 'T', version: '1', operations: [], schemas: { A: 'A' } },
      { title: 'T', version: '1', operations: [], schemas: { A: 'A', B: 'B' } },
    ] })).toBe(2);
  });
  it('dupes true / false', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    expect(svc.dupes({ docs: [
      { title: 'T', version: '1', operations: [op({ operationId: 'a' })], schemas: {} },
      { title: 'T', version: '1', operations: [op({ operationId: 'a' })], schemas: {} },
    ] })).toBe(true);
    expect(svc.dupes({ docs: [
      { title: 'T', version: '1', operations: [op({ operationId: 'a' })], schemas: {} },
      { title: 'T', version: '1', operations: [op({ operationId: 'b' })], schemas: {} },
    ] })).toBe(false);
  });
  it('validate', () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    expect(svc.validate({ docs: [] })).toContain('docs');
    expect(svc.validate({ docs: [{ title: 'T', version: '1', operations: [], schemas: {} }] })).toBeNull();
  });
});

describe('OpenApiMergeAuthService.ping', () => {
  it('true', async () => {
    const svc = new OpenApiMergeAuthService(makePrisma() as never);
    expect(await svc.ping()).toBe(true);
  });
});

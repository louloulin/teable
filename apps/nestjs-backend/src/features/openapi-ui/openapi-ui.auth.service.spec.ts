/**
 * OpenAPI UI — NestJS auth service spec (Stage 106).
 */

import { OpenApiUiAuthService } from './openapi-ui.auth.service';
import { OpenApiExportAuthService } from '../openapi-export/openapi-export.auth.service';
import { OpenApiMetadataAuthService } from '../openapi-metadata/openapi-metadata.auth.service';
import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';

interface IPrismaMock {
  openApiMetadata: {
    findFirst: (args: unknown) => Promise<unknown>;
    findMany: () => Promise<unknown[]>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  openApiOperation: {
    findFirst: (args: unknown) => Promise<unknown>;
    findMany: () => Promise<unknown[]>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(): IPrismaMock {
  return {
    openApiMetadata: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), upsert: vi.fn(async () => null) },
    openApiOperation: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), upsert: vi.fn(async () => null) },
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  };
}

function setup() {
  const prisma = makePrisma();
  const meta = new OpenApiMetadataAuthService(prisma as never);
  const exp = new OpenApiExportAuthService(prisma as never, meta);
  const svc = new OpenApiUiAuthService(prisma as never, exp);
  return { svc };
}

function op(over: Partial<IOperationSpec> = {}): IOperationSpec {
  return {
    operationId: 'p.list',
    resource: 'p',
    verb: 'GET',
    path: '/p',
    summary: 'list',
    authRequired: false,
    params: [],
    responses: [{ status: 200, schema: 'P' }],
    ...over,
  };
}

describe('OpenApiUiAuthService.page', () => {
  it('renders page', async () => {
    const { svc } = setup();
    const r = await svc.page({ jsonPath: '/api/t.openapi.json' });
    expect(r.html).toContain('<!doctype html>');
    expect(r.meta.sections.length).toBe(2);
  });
});

describe('OpenApiUiAuthService helpers', () => {
  it('renderOp', () => {
    const { svc } = setup();
    expect(svc.renderOp(op()).markup).toContain('<li');
  });
  it('renderHead', () => {
    const { svc } = setup();
    expect(svc.renderHead({ title: 'T', version: '1', jsonPath: '/x' }).markup).toContain('T');
  });
  it('groupByVerb', () => {
    const { svc } = setup();
    expect(Object.keys(svc.groupByVerb([op()])).length).toBe(1);
  });
  it('renderOps', () => {
    const { svc } = setup();
    expect(svc.renderOps([op()]).body).toContain('class="ops"');
  });
  it('renderSchemas empty / populated', () => {
    const { svc } = setup();
    expect(svc.renderSchemas({}).body).toContain('No schemas');
    expect(svc.renderSchemas({ A: 'A' }).body).toContain('<code>A</code>');
  });
  it('bootstrapScript', () => {
    const { svc } = setup();
    expect(svc.bootstrapScript({ jsonPath: '/x' })).toContain("fetch('/x')");
  });
  it('validateEndpoint', () => {
    const { svc } = setup();
    expect(svc.validateEndpoint('<li></li>')).toBeNull();
  });
  it('escape', () => {
    const { svc } = setup();
    expect(svc.escape('<')).toBe('&lt;');
  });
  it('isSafePath', () => {
    const { svc } = setup();
    expect(svc.isSafePath('/x')).toBe(true);
    expect(svc.isSafePath('http://x')).toBe(false);
  });
});

describe('OpenApiUiAuthService.ping', () => {
  it('true', async () => {
    const { svc } = setup();
    expect(await svc.ping()).toBe(true);
  });
});

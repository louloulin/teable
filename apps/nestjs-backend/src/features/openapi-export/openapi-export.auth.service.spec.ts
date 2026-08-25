/**
 * OpenAPI export — NestJS auth service spec (Stage 103).
 */

import { OpenApiExportAuthService } from './openapi-export.auth.service';
import { OpenApiMetadataAuthService } from '../openapi-metadata/openapi-metadata.auth.service';
import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';
import type { IOpenApiExportTarget } from './openapi-export.types';

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

function makePrisma(doc?: IOpenApiDocument): IPrismaMock {
  return {
    openApiMetadata: {
      findFirst: vi.fn(async () => (doc ? { id: 'main', document: doc } : null)),
      findMany: vi.fn(async () => (doc ? [{ id: 'main', document: doc }] : [])),
      upsert: vi.fn(async () => ({ id: 'main', document: doc })),
    },
    openApiOperation: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => null),
    },
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  };
}

describe('OpenApiExportAuthService.serialize / plan / defaultTarget', () => {
  it('serialize', async () => {
    const prisma = makePrisma({
      title: 'Teable',
      version: '1',
      operations: [],
      schemas: {},
    });
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    const s = await svc.serialize();
    expect(s.operations).toBe(0);
  });
  it('plan', async () => {
    const prisma = makePrisma({ title: 'T', version: '1', operations: [], schemas: {} });
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    const plan = await svc.plan({
      target: { name: 't', path: '/t.json', enabled: true },
    });
    expect(plan.operations).toBe(0);
  });
  it('defaultTarget', async () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    const t = await svc.defaultTarget({ root: '/api' });
    // default title = 'Teable API' → slug 'teable-api'
    expect(t.path).toMatch(/^\/api\/teable-api\.openapi\.json$/);
  });
});

describe('OpenApiExportAuthService.processTargets / validate / buildPath', () => {
  it('processTargets', async () => {
    const prisma = makePrisma({ title: 'T', version: '1', operations: [], schemas: {} });
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    const out = svc.processTargets({
      targets: [
        { name: 'a', path: '/a.json', enabled: true },
        { name: 'b', path: '/b.json', enabled: false },
      ],
    });
    expect(out.length).toBe(1);
  });
  it('validateTarget', () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    expect(
      svc.validateTarget({ name: 'a', path: '/a.json', enabled: true })
    ).toBeNull();
    expect(svc.validateTarget({ name: '', path: '', enabled: true })).toContain('name');
  });
  it('validateShape', () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    expect(svc.validateShape({ title: 'T', version: '1', operations: [], schemas: {} })).toBeNull();
  });
  it('buildPath', () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    expect(svc.buildPath({ name: 'Foo', root: '/x' })).toBe('/x/foo.openapi.json');
  });
});

describe('OpenApiExportAuthService.parse', () => {
  it('parses', () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    const p = svc.parse('{"title":"T","version":"1","operations":[],"schemas":{}}');
    expect(p?.title).toBe('T');
  });
  it('returns null on bad', () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    expect(svc.parse('garbage')).toBeNull();
  });
});

describe('OpenApiExportAuthService.ping', () => {
  it('true', async () => {
    const prisma = makePrisma();
    const meta = new OpenApiMetadataAuthService(prisma as never);
    const svc = new OpenApiExportAuthService(prisma as never, meta);
    expect(await svc.ping()).toBe(true);
  });
});

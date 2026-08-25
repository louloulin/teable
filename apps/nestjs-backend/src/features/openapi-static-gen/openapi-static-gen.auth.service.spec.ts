/**
 * OpenAPI static generation — NestJS auth service spec (Stage 105).
 */

import { OpenApiStaticGenAuthService } from './openapi-static-gen.auth.service';
import { OpenApiExportAuthService } from '../openapi-export/openapi-export.auth.service';
import { OpenApiMetadataAuthService } from '../openapi-metadata/openapi-metadata.auth.service';
import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';

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
    openApiMetadata: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => null),
    },
    openApiOperation: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => null),
    },
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  };
}

function setup() {
  const prisma = makePrisma();
  const meta = new OpenApiMetadataAuthService(prisma as never);
  const exp = new OpenApiExportAuthService(prisma as never, meta);
  const svc = new OpenApiStaticGenAuthService(prisma as never, exp);
  return { svc };
}

describe('OpenApiStaticGenAuthService.plan', () => {
  it('plan with html', async () => {
    const { svc } = setup();
    const plan = await svc.plan({ root: '/x', htmlBody: '<html></html>' });
    expect(plan.artifacts.length).toBe(2);
  });
  it('plan without html', async () => {
    const { svc } = setup();
    const plan = await svc.plan({ root: '/x' });
    expect(plan.artifacts.length).toBe(1);
  });
});

describe('OpenApiStaticGenAuthService.validate / paths / hash / queries', () => {
  it('validate', () => {
    const { svc } = setup();
    expect(svc.validate({ root: '', prettyJson: '' })).toContain('root');
  });
  it('paths', () => {
    const { svc } = setup();
    expect(svc.jsonPath({ root: '/x', name: 'A B' })).toBe('openapi/a-b.openapi.json');
    expect(svc.htmlPath({ root: '/x' })).toBe('openapi/index.html');
  });
  it('hash', () => {
    const { svc } = setup();
    expect(svc.hash('hi')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('find / has / count', async () => {
    const { svc } = setup();
    const plan = await svc.plan({ root: '/x', htmlBody: '<html></html>' });
    expect(svc.find(plan, 'openapi/teable.openapi.json')?.kind).toBe('json');
    expect(svc.hasJson(plan)).toBe(true);
    expect(svc.hasHtml(plan)).toBe(true);
    expect(svc.count(plan)).toBe(2);
    expect(svc.hashed(plan)).toBe(true);
  });
  it('cap', async () => {
    const { svc } = setup();
    const plan = await svc.plan({ root: '/x', htmlBody: '<html></html>' });
    expect(svc.cap(plan, 1).artifacts.length).toBe(1);
  });
});

describe('OpenApiStaticGenAuthService.changed / ping', () => {
  it('changed false', async () => {
    const { svc } = setup();
    const a = await svc.plan({ root: '/x' });
    const b = await svc.plan({ root: '/x' });
    expect(svc.changed({ plan: a, previous: b })).toBe(false);
  });
  it('ping', async () => {
    const { svc } = setup();
    expect(await svc.ping()).toBe(true);
  });
});

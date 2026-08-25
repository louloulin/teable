/**
 * SDK Code Generator (JS/TS) — NestJS auth service spec (Stage 117).
 */

import { SdkCodegenJsAuthService } from './sdk-codegen-js.auth.service';
import { OpenApiDocument } from './sdk-codegen-js.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new SdkCodegenJsAuthService(makePrisma() as never);
}
function doc(): OpenApiDocument {
  return {
    title: 'T', version: '1', servers: ['https://api.example'],
    operations: [{ operationId: 'list_x', method: 'GET', path: '/x' }],
    schemas: [],
  };
}

describe('SdkCodegenJsAuthService.generate / files', () => {
  it('generate', () => {
    expect(setup().generate(doc()).files.length).toBeGreaterThan(0);
  });
  it('files', () => {
    expect(setup().files(doc()).length).toBeGreaterThan(0);
  });
});

describe('SdkCodegenJsAuthService.pathForm / grouped', () => {
  it('pathForm', () => {
    expect(setup().pathForm('/x/{id}')).toBe('/x/:id');
  });
  it('grouped', () => {
    expect(Object.keys(setup().grouped(doc())).length).toBeGreaterThan(0);
  });
});

describe('SdkCodegenJsAuthService.schemaIface / opMethod / tsType', () => {
  it('schemaIface', () => {
    expect(setup().schemaIface({ ref: 'R', tsType: 'R', required: ['a'], properties: [{ name: 'a', tsType: 'string', optional: false }] })).toContain('export interface R');
  });
  it('opMethod', () => {
    expect(setup().opMethod({ operationId: 'list_x', method: 'GET', path: '/x' })).toContain('async listX(');
  });
  it('tsType', () => {
    expect(setup().tsType({ name: 'x', in: 'path', type: 'string', required: true })).toBe('string');
  });
});

describe('SdkCodegenJsAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});
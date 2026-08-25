/**
 * SDK Code Generator (Python) — NestJS auth service spec (Stage 118).
 */

import { SdkCodegenPyAuthService } from './sdk-codegen-py.auth.service';
import { OpenApiDocumentPy } from './sdk-codegen-py.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new SdkCodegenPyAuthService(makePrisma() as never);
}
function doc(): OpenApiDocumentPy {
  return {
    title: 'T', version: '1', servers: ['https://api.example'],
    operations: [{ operationId: 'list_x', method: 'GET', path: '/x' }],
    schemas: [],
  };
}

describe('SdkCodegenPyAuthService.generate / files', () => {
  it('generate', () => {
    expect(setup().generate(doc()).files.length).toBeGreaterThan(0);
  });
  it('files', () => {
    expect(setup().files(doc()).length).toBeGreaterThan(0);
  });
});

describe('SdkCodegenPyAuthService helpers', () => {
  it('pyType', () => {
    expect(setup().pyType('string')).toBe('str');
    expect(setup().pyType('boolean')).toBe('bool');
  });
  it('pathF', () => {
    expect(setup().pathF('/x/{id}')).toBe('/x/{id}');
  });
  it('grouped', () => {
    expect(Object.keys(setup().grouped(doc())).length).toBeGreaterThan(0);
  });
  it('schemaDC', () => {
    expect(setup().schemaDC({ ref: 'R', pyType: 'R', required: [], properties: [] })).toContain('class R');
  });
  it('opMethod', () => {
    expect(setup().opMethod({ operationId: 'list_x', method: 'GET', path: '/x' })).toContain('async def list_x');
  });
});

describe('SdkCodegenPyAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});
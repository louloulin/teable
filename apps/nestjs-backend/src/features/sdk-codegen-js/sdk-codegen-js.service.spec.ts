/**
 * SDK Code Generator (JS/TS) — pure helpers spec (Stage 117).
 */

import {
  generateSdk,
  groupByTag,
  opToMethod,
  pathToColonForm,
  schemaToInterface,
} from './sdk-codegen-js.service';
import { OpenApiDocument } from './sdk-codegen-js.types';

function doc(over: Partial<OpenApiDocument> = {}): OpenApiDocument {
  return {
    title: 'Teable', version: '1.0.0', servers: ['https://api.teable.ai'],
    operations: [
      { operationId: 'list_records', method: 'GET', path: '/tables/{tableId}/records', tags: ['records'], parameters: [{ name: 'tableId', in: 'path', type: 'string', required: true }], responseSchemaRef: 'Record[]' },
      { operationId: 'create_record', method: 'POST', path: '/tables/{tableId}/records', tags: ['records'], requestBody: { schemaRef: 'Record', required: true }, responseSchemaRef: 'Record' },
    ],
    schemas: [
      { ref: 'Record', tsType: 'Record', required: ['id', 'name'], properties: [{ name: 'id', tsType: 'string', optional: false }, { name: 'name', tsType: 'string', optional: false }] },
    ],
    ...over,
  };
}

describe('sdk-codegen-js.pathToColonForm', () => {
  it('converts', () => {
    expect(pathToColonForm('/tables/{tableId}/records')).toBe('/tables/:tableId/records');
  });
  it('no params', () => {
    expect(pathToColonForm('/health')).toBe('/health');
  });
});

describe('sdk-codegen-js.schemaToInterface', () => {
  it('with required', () => {
    const s = { ref: 'R', tsType: 'R', required: ['id'], properties: [{ name: 'id', tsType: 'string', optional: false }, { name: 'name', tsType: 'string', optional: true }] };
    const out = schemaToInterface(s);
    expect(out).toContain('export interface R');
    expect(out).toContain('id: string;');
    expect(out).toContain('name?: string;');
  });
});

describe('sdk-codegen-js.groupByTag', () => {
  it('groups', () => {
    const g = groupByTag(doc());
    expect(g.records.length).toBe(2);
  });
});

describe('sdk-codegen-js.opToMethod', () => {
  it('GET method', () => {
    const m = opToMethod({ operationId: 'list_records', method: 'GET', path: '/records', parameters: [] }, new Map());
    expect(m).toContain('async listRecords(');
    expect(m).toContain("'GET'");
  });
  it('POST with body', () => {
    const m = opToMethod({ operationId: 'create_record', method: 'POST', path: '/records', requestBody: { schemaRef: 'Record', required: true } }, new Map());
    expect(m).toContain('body: Record');
  });
  it('snake to camel', () => {
    const m = opToMethod({ operationId: 'list_my_records', method: 'GET', path: '/records' }, new Map());
    expect(m).toContain('async listMyRecords(');
  });
});

describe('sdk-codegen-js.generateSdk', () => {
  it('produces files', () => {
    const r = generateSdk({ doc: doc() });
    const paths = r.files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/client.ts');
    expect(paths).toContain('src/types/Record.ts');
    expect(paths).toContain('README.md');
    expect(r.entrypoint).toBe('src/index.ts');
  });
  it('package.json contains version', () => {
    const r = generateSdk({ doc: doc(), version: '1.2.3' });
    const pkg = r.files.find((f) => f.path === 'package.json')!;
    expect(pkg.content).toContain('"version": "1.2.3"');
  });
  it('custom package name', () => {
    const r = generateSdk({ doc: doc(), packageName: '@teable/foo' });
    const pkg = r.files.find((f) => f.path === 'package.json')!;
    expect(pkg.content).toContain('@teable/foo');
  });
  it('index has class declarations', () => {
    const r = generateSdk({ doc: doc() });
    const idx = r.files.find((f) => f.path === 'src/index.ts')!;
    expect(idx.content).toContain('class TeableSdk');
    expect(idx.content).toContain('class Records');
  });
});
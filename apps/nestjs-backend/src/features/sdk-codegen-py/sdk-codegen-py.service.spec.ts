/**
 * SDK Code Generator (Python) — pure helpers spec (Stage 118).
 */

import {
  generatePySdk,
  groupByTagPy,
  jsTypeToPy,
  opToAsyncMethod,
  pathToFString,
  schemaToDataclass,
} from './sdk-codegen-py.service';
import { OpenApiDocumentPy } from './sdk-codegen-py.types';

function doc(over: Partial<OpenApiDocumentPy> = {}): OpenApiDocumentPy {
  return {
    title: 'Teable', version: '1.0.0', servers: ['https://api.teable.ai'],
    operations: [
      { operationId: 'list_records', method: 'GET', path: '/tables/{tableId}/records', tags: ['records'], parameters: [{ name: 'tableId', in: 'path', type: 'string', required: true }], responseSchemaRef: 'List' },
    ],
    schemas: [
      { ref: 'Record', pyType: 'Record', required: ['id'], properties: [{ name: 'id', pyType: 'string', optional: false }] },
    ],
    ...over,
  };
}

describe('sdk-codegen-py.jsTypeToPy', () => {
  it('maps', () => {
    expect(jsTypeToPy('string')).toBe('str');
    expect(jsTypeToPy('number')).toBe('float');
    expect(jsTypeToPy('boolean')).toBe('bool');
    expect(jsTypeToPy('integer')).toBe('int');
    expect(jsTypeToPy('unknown')).toBe('Any');
  });
});

describe('sdk-codegen-py.pathToFString', () => {
  it('keeps braces', () => {
    expect(pathToFString('/x/{id}')).toBe('/x/{id}');
  });
});

describe('sdk-codegen-py.schemaToDataclass', () => {
  it('with required + optional', () => {
    const s: import('./sdk-codegen-py.types').OpenApiSchemaPy = { ref: 'R', pyType: 'R', required: ['id'], properties: [{ name: 'id', pyType: 'string', optional: false }, { name: 'name', pyType: 'string', optional: true }] };
    const out = schemaToDataclass(s);
    expect(out).toContain('@dataclass');
    expect(out).toContain('class R');
    expect(out).toContain('id: str');
    expect(out).toContain('name: Optional[str] = None');
  });
});

describe('sdk-codegen-py.opToAsyncMethod', () => {
  it('GET with path param', () => {
    const m = opToAsyncMethod({ operationId: 'list_records', method: 'GET', path: '/x/{id}', parameters: [{ name: 'id', in: 'path', type: 'string', required: true }] });
    expect(m).toContain('async def list_records');
    expect(m).toContain('id: str');
  });
  it('snake_case naming', () => {
    const m = opToAsyncMethod({ operationId: 'listMyRecords', method: 'GET', path: '/x' });
    expect(m).toContain('async def list_my_records');
  });
  it('POST with body', () => {
    const m = opToAsyncMethod({ operationId: 'create_record', method: 'POST', path: '/x', requestBody: { schemaRef: 'R', required: true } });
    expect(m).toContain('body: R');
    expect(m).toContain('body=body');
  });
});

describe('sdk-codegen-py.groupByTagPy', () => {
  it('groups', () => {
    expect(groupByTagPy(doc()).records.length).toBe(1);
  });
});

describe('sdk-codegen-py.generatePySDK', () => {
  it('produces files', () => {
    const r = generatePySdk({ doc: doc() });
    expect(r.files.length).toBeGreaterThan(0);
    expect(r.entrypoint).toBe('teable_sdk/__init__.py');
  });
  it('pyproject has version', () => {
    const r = generatePySdk({ doc: doc(), version: '1.2.3' });
    expect(r.files.find((f) => f.path === 'pyproject.toml')!.content).toContain('"1.2.3"');
  });
  it('client uses httpx', () => {
    const r = generatePySdk({ doc: doc() });
    expect(r.files.find((f) => f.path === 'teable_sdk/client.py')!.content).toContain('httpx');
  });
});
/**
 * OpenAPI merge — pure helpers spec (Stage 104).
 */

import {
  controllerRouteToOperation,
  controllerSpecToOperations,
  countSchemas,
  findAcross,
  hasDuplicates,
  listOperationIds,
  mergeOpenApiDocuments,
  pathParamsFromTemplate,
  validateMergeInput,
} from './openapi-merge.service';
import type { IControllerSpec, IRouteSpec } from '../controller-factory/controller-factory.types';
import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';

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

const doc = (ops: IOperationSpec[], schemas: Record<string, string> = {}): IOpenApiDocument => ({
  title: 'T',
  version: '1',
  operations: ops,
  schemas,
});

describe('openapi-merge.validateMergeInput', () => {
  it('passes', () => {
    expect(validateMergeInput({ docs: [doc([])] })).toBeNull();
  });
  it('empty', () => {
    expect(validateMergeInput({ docs: [] })).toContain('docs');
  });
  it('bad policy', () => {
    expect(validateMergeInput({ docs: [doc([])], conflictPolicy: 'nope' as never })).toContain('policy');
  });
});

describe('openapi-merge.pathParamsFromTemplate', () => {
  it('none', () => {
    expect(pathParamsFromTemplate('/a/b').length).toBe(0);
  });
  it('one', () => {
    expect(pathParamsFromTemplate('/a/:id').map((p) => p.name)).toEqual(['id']);
  });
  it('two', () => {
    expect(pathParamsFromTemplate('/a/:orgId/:id').map((p) => p.name)).toEqual(['orgId', 'id']);
  });
});

describe('openapi-merge.controllerRouteToOperation / controllerSpecToOperations', () => {
  it('list', () => {
    const r: IRouteSpec = { path: '/', verb: 'list', operationId: 'list', authRequired: false };
    const op1 = controllerRouteToOperation({ resource: 'p', route: r, stubSchemas: true });
    expect(op1.operationId).toBe('p.list');
    expect(op1.verb).toBe('GET');
    expect(op1.path).toBe('/p');
    expect(op1.responses[0]!.schema).toBe('p.Result');
  });
  it('nested', () => {
    const r: IRouteSpec = { path: '/:id', verb: 'get', operationId: 'get', authRequired: true };
    const op1 = controllerRouteToOperation({ resource: 'p', route: r, stubSchemas: false });
    expect(op1.path).toBe('/p/:id');
    expect(op1.params.map((p) => p.name)).toEqual(['id']);
    expect(op1.responses[0]!.schema).toBe('Result');
  });
  it('controllerSpecToOperations', () => {
    const c: IControllerSpec = {
      resource: 'p',
      routes: [
        { path: '/', verb: 'list', operationId: 'list', authRequired: false },
        { path: '/:id', verb: 'get', operationId: 'get', authRequired: true },
      ],
    };
    const ops = controllerSpecToOperations({ controller: c });
    expect(ops.length).toBe(2);
    expect(ops[1]!.params.map((p) => p.name)).toEqual(['id']);
  });
});

describe('openapi-merge.mergeOpenApiDocuments', () => {
  it('two docs no conflict', () => {
    const result = mergeOpenApiDocuments({
      docs: [
        doc([op({ operationId: 'a.list' })]),
        doc([op({ operationId: 'b.list', resource: 'b', path: '/b' })]),
      ],
    });
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.doc.operations.length).toBe(2);
  });
  it('skip conflict', () => {
    const result = mergeOpenApiDocuments({
      docs: [
        doc([op({ operationId: 'a.list' })]),
        doc([op({ operationId: 'a.list' })]),
      ],
      conflictPolicy: 'skip',
    });
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(1);
    expect(result.conflicts.length).toBe(1);
  });
  it('overwrite conflict', () => {
    const result = mergeOpenApiDocuments({
      docs: [
        doc([op({ operationId: 'a.list', summary: 'old' })]),
        doc([op({ operationId: 'a.list', summary: 'new' })]),
      ],
      conflictPolicy: 'overwrite',
    });
    expect(result.doc.operations[0]!.summary).toBe('new');
  });
  it('error policy throws', () => {
    expect(() =>
      mergeOpenApiDocuments({
        docs: [
          doc([op({ operationId: 'a.list' })]),
          doc([op({ operationId: 'a.list' })]),
        ],
        conflictPolicy: 'error',
      })
    ).toThrow();
  });
  it('merges schemas', () => {
    const result = mergeOpenApiDocuments({
      docs: [doc([], { A: 'A' }), doc([], { B: 'B' })],
    });
    expect(Object.keys(result.doc.schemas).sort()).toEqual(['A', 'B']);
  });
  it('skips invalid ops', () => {
    const result = mergeOpenApiDocuments({
      docs: [doc([{ ...op({ operationId: '' }), operationId: '' }]), doc([])],
    });
    expect(result.invalid).toBe(1);
  });
  it('uses custom title/version', () => {
    const result = mergeOpenApiDocuments({
      docs: [doc([op()])],
      title: 'Custom',
      version: '2.0',
    });
    expect(result.doc.title).toBe('Custom');
    expect(result.doc.version).toBe('2.0');
  });
});

describe('openapi-merge.findAcross / listOperationIds / countSchemas / hasDuplicates', () => {
  it('findAcross found', () => {
    const r = findAcross({
      docs: [doc([]), doc([op({ operationId: 'a.list' })])],
      operationId: 'a.list',
    });
    expect(r?.op.operationId).toBe('a.list');
  });
  it('findAcross null', () => {
    expect(findAcross({ docs: [doc([])], operationId: 'nope' })).toBeNull();
  });
  it('listOperationIds dedup', () => {
    expect(
      listOperationIds({
        docs: [doc([op({ operationId: 'a' })]), doc([op({ operationId: 'a' }), op({ operationId: 'b' })])],
      })
    ).toEqual(['a', 'b']);
  });
  it('countSchemas', () => {
    expect(countSchemas({ docs: [doc([], { A: 'A' }), doc([], { A: 'A', B: 'B' })] })).toBe(2);
  });
  it('hasDuplicates true / false', () => {
    expect(hasDuplicates({ docs: [doc([op({ operationId: 'a' })]), doc([op({ operationId: 'a' }), op({ operationId: 'b' })])] })).toBe(true);
    expect(hasDuplicates({ docs: [doc([op({ operationId: 'a' })]), doc([op({ operationId: 'b' })])] })).toBe(false);
  });
});

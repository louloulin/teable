/**
 * OpenAPI metadata — pure helpers spec (Stage 93).
 */

import {
  buildDocument,
  countsByVerb,
  filterByAuth,
  filterByVerb,
  findOperation,
  mergeDocuments,
  uniqueResources,
  validateOperation,
  validateParam,
} from './openapi-metadata.service';
import type { IOperationSpec } from './openapi-metadata.types';

const baseOp = (over: Partial<IOperationSpec> = {}): IOperationSpec => ({
  operationId: 'listRiskPolicies',
  resource: 'risk-policies',
  verb: 'GET',
  path: '/api/risk-policies',
  summary: 'list risk policies',
  authRequired: true,
  params: [],
  responses: [{ status: 200, schema: 'RiskPolicyList' }],
  ...over,
});

describe('openapi-metadata.validateParam', () => {
  it('passes', () => {
    expect(
      validateParam({ name: 'limit', in: 'query', required: false, type: 'integer' })
    ).toBeNull();
  });
  it('rejects unknown location', () => {
    expect(
      validateParam({ name: 'limit', in: 'body' as never, required: false, type: 'integer' })
    ).toContain('location');
  });
});

describe('openapi-metadata.validateOperation', () => {
  it('passes', () => {
    expect(validateOperation(baseOp())).toBeNull();
  });
  it('rejects path without slash', () => {
    expect(validateOperation(baseOp({ path: 'risk-policies' }))).toContain('/');
  });
  it('rejects bad verb', () => {
    expect(validateOperation(baseOp({ verb: 'WAT' as never }))).toContain('verb');
  });
});

describe('openapi-metadata.buildDocument', () => {
  it('builds', () => {
    const doc = buildDocument({
      title: 'Teable API',
      version: '1.0.0',
      operations: [baseOp()],
    });
    expect(doc.operations.length).toBe(1);
  });
  it('rejects invalid', () => {
    expect(() =>
      buildDocument({
        title: 'x',
        version: '1',
        operations: [baseOp({ operationId: '' })],
      })
    ).toThrow();
  });
});

describe('openapi-metadata.filterByVerb', () => {
  it('filters', () => {
    const doc = buildDocument({
      title: 'x',
      version: '1',
      operations: [baseOp(), baseOp({ operationId: 'create', verb: 'POST', path: '/api/x' })],
    });
    expect(filterByVerb({ doc, verb: 'GET' }).length).toBe(1);
    expect(filterByVerb({ doc, verb: 'POST' }).length).toBe(1);
  });
});

describe('openapi-metadata.filterByAuth', () => {
  it('filters', () => {
    const doc = buildDocument({
      title: 'x',
      version: '1',
      operations: [
        baseOp(),
        baseOp({ operationId: 'public', authRequired: false, path: '/api/p' }),
      ],
    });
    expect(filterByAuth({ doc, authRequired: true }).length).toBe(1);
  });
});

describe('openapi-metadata.findOperation', () => {
  it('found', () => {
    const doc = buildDocument({
      title: 'x',
      version: '1',
      operations: [baseOp()],
    });
    expect(findOperation({ doc, operationId: 'listRiskPolicies' })?.verb).toBe('GET');
  });
});

describe('openapi-metadata.countsByVerb', () => {
  it('counts', () => {
    const doc = buildDocument({
      title: 'x',
      version: '1',
      operations: [
        baseOp(),
        baseOp({ operationId: 'create', verb: 'POST', path: '/api/x' }),
        baseOp({ operationId: 'del', verb: 'DELETE', path: '/api/x' }),
      ],
    });
    expect(countsByVerb(doc)['POST']).toBe(1);
    expect(countsByVerb(doc)['GET']).toBe(1);
  });
});

describe('openapi-metadata.uniqueResources', () => {
  it('unique', () => {
    const doc = buildDocument({
      title: 'x',
      version: '1',
      operations: [baseOp(), baseOp({ operationId: 'get', verb: 'GET', path: '/api/x/:id' })],
    });
    expect(uniqueResources(doc)).toEqual(['risk-policies']);
  });
});

describe('openapi-metadata.mergeDocuments', () => {
  it('merges', () => {
    const a = buildDocument({ title: 'x', version: '1', operations: [baseOp()] });
    const b = buildDocument({
      title: 'x',
      version: '1',
      operations: [baseOp({ operationId: 'create', verb: 'POST', path: '/api/x' })],
    });
    expect(mergeDocuments(a, b).operations.length).toBe(2);
  });
});
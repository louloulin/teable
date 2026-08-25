/**
 * OpenAPI export — pure helpers spec (Stage 103).
 */

import {
  buildExportPath,
  capTargets,
  defaultTargetFor,
  enabledTargets,
  parsePayload,
  planExport,
  resolveCollision,
  serializeDocument,
  validateShape,
  validateTarget,
} from './openapi-export.service';
import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';
import type { IOpenApiExportTarget } from './openapi-export.types';

function doc(over: Partial<IOpenApiDocument> = {}): IOpenApiDocument {
  return {
    title: 'Teable API',
    version: '1.0.0',
    operations: [],
    schemas: {},
    ...over,
  };
}

const target = (over: Partial<IOpenApiExportTarget> = {}): IOpenApiExportTarget => ({
  name: 'teable',
  path: '/api/teable.openapi.json',
  enabled: true,
  ...over,
});

describe('openapi-export.buildExportPath / validateTarget', () => {
  it('buildExportPath', () => {
    expect(buildExportPath({ name: 'Teable', root: '/api' })).toBe('/api/teable.openapi.json');
  });
  it('slugifies', () => {
    expect(buildExportPath({ name: 'A B!', root: '/x' })).toBe('/x/a-b-.openapi.json');
  });
  it('trailing slash', () => {
    expect(buildExportPath({ name: 'a', root: '/x/' })).toBe('/x/a.openapi.json');
  });
  it('validateTarget', () => {
    expect(validateTarget(target())).toBeNull();
    expect(validateTarget(target({ name: '' }))).toContain('name');
    expect(validateTarget(target({ path: '' }))).toContain('path');
    expect(validateTarget(target({ path: 'no-slash' }))).toContain('absolute');
    expect(validateTarget(target({ enabled: undefined as never }))).toContain('enabled');
  });
});

describe('openapi-export.validateShape / serializeDocument', () => {
  it('passes', () => {
    expect(validateShape(doc())).toBeNull();
  });
  it('rejects empty title', () => {
    expect(validateShape(doc({ title: '' }))).toContain('title');
  });
  it('rejects missing operations', () => {
    expect(validateShape(doc({ operations: undefined as never }))).toContain('operations');
  });
  it('serialize round-trip', () => {
    const d = doc({ operations: [
      {
        operationId: 'list',
        resource: 'p',
        verb: 'GET',
        path: '/p',
        summary: 'list',
        authRequired: false,
        params: [],
        responses: [{ status: 200, schema: 'P' }],
      },
    ], schemas: { P: 'P' } });
    const s = serializeDocument(d);
    expect(s.operations).toBe(1);
    expect(s.schemas).toBe(1);
    expect(JSON.parse(s.json).title).toBe('Teable API');
  });
  it('serialize throws on invalid', () => {
    expect(() => serializeDocument({ title: '' } as never)).toThrow();
  });
});

describe('openapi-export.planExport / capTargets / enabledTargets', () => {
  it('plan', () => {
    const plan = planExport({ doc: doc(), target: target() });
    expect(plan.operations).toBe(0);
    expect(plan.schemas).toBe(0);
  });
  it('plan throws on invalid target', () => {
    expect(() => planExport({ doc: doc(), target: target({ name: '' }) })).toThrow();
  });
  it('capTargets passes when under', () => {
    const list = [target({ name: 'a' })];
    expect(capTargets(list).length).toBe(1);
  });
  it('enabledTargets', () => {
    const list = [target({ name: 'a' }), target({ name: 'b', enabled: false })];
    expect(enabledTargets(list).length).toBe(1);
  });
});

describe('openapi-export.resolveCollision / defaultTargetFor / parsePayload', () => {
  it('no collision', () => {
    expect(resolveCollision({ existing: ['a'], candidate: 'b' })).toBe('b');
  });
  it('collision', () => {
    expect(resolveCollision({ existing: ['a'], candidate: 'a' })).toBe('a-2');
    expect(resolveCollision({ existing: ['a', 'a-2'], candidate: 'a' })).toBe('a-3');
  });
  it('defaultTargetFor', () => {
    const t = defaultTargetFor({ doc: doc(), root: '/api' });
    expect(t.name).toBe('teable-api');
    expect(t.path).toBe('/api/teable-api.openapi.json');
  });
  it('parsePayload round-trip', () => {
    const s = serializeDocument(doc());
    const p = parsePayload(s.json);
    expect(p?.title).toBe('Teable API');
  });
  it('parsePayload invalid', () => {
    expect(parsePayload('not-json')).toBeNull();
    expect(parsePayload('{"title":""}')).toBeNull();
  });
});

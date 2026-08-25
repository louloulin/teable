/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildExplorerHtml,
  buildOpenApiSpec,
  serializeSpec,
  validateRouteSpec,
} from './api-explorer.service';
import type { IRouteSpec } from './api-explorer.types';

const baseRoute: IRouteSpec = {
  operationId: 'thing.list',
  method: 'GET',
  path: '/api/thing',
  summary: 'List things',
};

describe('api-explorer.buildOpenApiSpec', () => {
  it('groups routes by path + method', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'Teable OSS', version: '1.0.0' },
      routes: [
        baseRoute,
        { ...baseRoute, operationId: 'thing.create', method: 'POST', path: '/api/thing' },
      ],
    });
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/api/thing']?.get?.operationId).toBe('thing.list');
    expect(spec.paths['/api/thing']?.post?.operationId).toBe('thing.create');
  });
  it('attaches bearer security by default', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'T', version: '1' },
      routes: [baseRoute],
    });
    expect(spec.paths['/api/thing']?.get?.security).toEqual([{ bearer: [] }]);
    expect(spec.components?.securitySchemes?.bearer?.scheme).toBe('bearer');
  });
  it('emits request body schema when present', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'T', version: '1' },
      routes: [
        {
          operationId: 'thing.create',
          method: 'POST',
          path: '/api/thing',
          summary: 'Create',
          requestBody: {
            name: 'body',
            in: 'body',
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
        },
      ],
    });
    const schema = spec.paths['/api/thing']?.post?.requestBody?.content['application/json'].schema;
    expect(schema?.type).toBe('object');
    expect(schema?.required).toEqual(['name']);
  });
  it('uses baseUrl as server', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'T', version: '1', baseUrl: 'https://api.teable.test' },
      routes: [baseRoute],
    });
    expect(spec.servers?.[0]?.url).toBe('https://api.teable.test');
  });
  it('skips security when route opts out', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'T', version: '1', requireAuthByDefault: true },
      routes: [{ ...baseRoute, requiresAuth: false }],
    });
    expect(spec.paths['/api/thing']?.get?.security).toBeUndefined();
  });
});

describe('api-explorer.buildExplorerHtml', () => {
  it('renders header, groups, and try buttons', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'Teable OSS', version: '1.0.0' },
      routes: [baseRoute],
    });
    const html = buildExplorerHtml({ spec, options: { title: 'Teable OSS', version: '1.0.0' } });
    expect(html).toContain('<title>Teable OSS — API Explorer</title>');
    expect(html).toContain('class="method method-get"');
    expect(html).toContain('thing.list');
    expect(html).toContain('button class="try"');
    expect(html).toContain('<pre class="result"');
  });
  it('groups routes by tag', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'T', version: '1' },
      routes: [
        baseRoute,
        { ...baseRoute, operationId: 'other.list', path: '/api/other', tags: ['misc'] } as never,
      ],
    });
    const html = buildExplorerHtml({ spec, options: { title: 'T', version: '1' } });
    expect(html).toContain('<h2>api</h2>');
    expect(html).toContain('<h2>misc</h2>');
  });
  it('escapes script injection attempts in titles', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'Teable OSS', version: '1' },
      routes: [baseRoute],
    });
    const html = buildExplorerHtml({
      spec,
      options: { title: '<script>alert(1)</script>', version: '1' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('api-explorer.validateRouteSpec', () => {
  it('flags missing fields', () => {
    expect(
      validateRouteSpec({ operationId: '', method: 'GET', path: 'thing', summary: '' })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('operationId'),
        expect.stringContaining('"/"'),
        expect.stringContaining('summary'),
      ])
    );
  });
  it('accepts a valid spec', () => {
    expect(validateRouteSpec(baseRoute)).toEqual([]);
  });
});

describe('api-explorer.serializeSpec', () => {
  it('produces indented JSON', () => {
    const spec = buildOpenApiSpec({
      options: { title: 'T', version: '1' },
      routes: [baseRoute],
    });
    const json = serializeSpec(spec);
    expect(json).toContain('\n');
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe('3.1.0');
  });
});
